import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  addDays,
  CLOSED_DAY_TYPES,
  closureCovers,
  exceptionProblems,
  slotProblems,
  slotRunsOn,
  type SlotScope,
  type TimetableCheckResult,
  type TimetableOccurrence,
  type TimetableSlotInput,
  type TimetableWarningDto,
  type AcknowledgedWarning,
  type SlotExceptionInput,
} from '@cdls/shared';
import { AccessService } from '../access/access.service.js';
import { canEditStructure } from '../access/grants.js';
import { loadClosures } from '../calendar-days/closures.js';
import { type AuditEntry, audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, schoolToday, toDay } from '../common/dates.js';
import { forbidden, notFound } from '../common/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { conflictBlocked, warningsBlocked } from '../occupancy/blocked.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';
import { expandSlots, slotInclude, type SlotRow, toSlotData } from '../occupancy/slot-data.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateSlotExceptionDto,
  CreateTimetableSlotDto,
  DeleteTimetableSlotQueryDto,
  TimetableCheckDto,
  TimetableWriteResultDto,
  UpdateTimetableSlotDto,
} from './dto/timetable.dto.js';
import { toExceptionDto, toSlotDto } from './timetable.mapper.js';
import { WarningsService } from './warnings.service.js';

type Db = Prisma.TransactionClient;

/** What a mutation did inside the transaction, so the index and the checks can follow. */
interface Applied {
  /** Slots whose index rows are rewritten (the ones that still exist). */
  readonly touched: readonly string[];
  /** Slots whose sessions are checked for soft warnings (new or changed rules). */
  readonly warn: readonly string[];
  /** Only this session is checked (an exception), not the whole series. */
  readonly onlySession: { readonly slotId: string; readonly date: string } | null;
  /** Also check the rule itself (hours per week). */
  readonly series: boolean;
  readonly slotId: string | null;
  readonly endedSlotId: string | null;
  readonly exceptionId: string | null;
  readonly audit: readonly AuditEntry[];
}

type Mutation = (tx: Db) => Promise<Applied>;

/** Thrown inside the transaction by a dry run, to roll it back and hand the verdict out. */
class DryRun extends Error {
  constructor(readonly result: TimetableCheckResult) {
    super('dry run');
  }
}

const TEACHER_KINDS = new Set(['cancelled', 'moved', 'room_change']);
const PAST = 'Les séances passées ne se modifient plus.';

const definedOnly = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Writes to the timetable. Every write runs in ONE transaction: the slot or exception is saved, the
 * occupancy index of the slots it touches is rewritten, and hard conflicts (room, teacher, class) roll
 * everything back with a 409. Soft warnings need an acknowledgement with a reason, kept in the audit log.
 * The exclusion constraints of `occupancy` hold even when two requests race.
 */
@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly occupancy: OccupancyService,
    private readonly warnings: WarningsService,
  ) {}

  /** Today in Cairo; the clock of « sessions already held ». */
  today(): string {
    return schoolToday();
  }

  /* Entry points ------------------------------------------------------------------------------ */

  async create(dto: CreateTimetableSlotDto, user: AuthUser): Promise<TimetableWriteResultDto> {
    return this.commit(this.createMutation(dto, user), dto.acknowledgedWarnings ?? []);
  }

  async update(
    id: string,
    dto: UpdateTimetableSlotDto,
    user: AuthUser,
  ): Promise<TimetableWriteResultDto> {
    return this.commit(this.updateMutation(id, dto, user), dto.acknowledgedWarnings ?? []);
  }

  async remove(
    id: string,
    query: DeleteTimetableSlotQueryDto,
    user: AuthUser,
  ): Promise<TimetableWriteResultDto> {
    return this.commit(this.removeMutation(id, query.scope, query.date, user), []);
  }

  async addException(
    slotId: string,
    dto: CreateSlotExceptionDto,
    user: AuthUser,
  ): Promise<TimetableWriteResultDto> {
    const { date, acknowledgedWarnings, ...input } = dto;
    return this.commit(
      async (tx) =>
        this.writeException(
          tx,
          await this.load(tx, slotId),
          date,
          definedOnly(input) as SlotExceptionInput,
          user,
        ),
      acknowledgedWarnings ?? [],
    );
  }

  async removeException(id: string, user: AuthUser): Promise<TimetableWriteResultDto> {
    return this.commit(async (tx) => {
      const ex = await tx.slotException.findUnique({ where: { id } });
      if (!ex) throw notFound('Exception');
      const row = await this.load(tx, ex.slotId);
      await this.authorize(row, user);
      // A teacher restores what a teacher may do, not a replacement the administration named.
      if (!canEditStructure(user) && !TEACHER_KINDS.has(ex.kind)) throw forbidden();
      if (toDay(ex.date) < this.today()) throw new BadRequestException(PAST);
      await tx.slotException.delete({ where: { id } });
      return {
        touched: [row.id],
        warn: [row.id],
        onlySession: { slotId: row.id, date: toDay(ex.date) },
        series: false,
        slotId: row.id,
        endedSlotId: null,
        exceptionId: null,
        audit: [
          this.entry(user, 'slot_exception.delete', 'slot_exception', id, {
            slotId: row.id,
            date: toDay(ex.date),
            kind: ex.kind,
          }),
        ],
      };
    }, []);
  }

  /** What a write would do (conflicts and warnings), saving nothing. */
  async check(dto: TimetableCheckDto, user: AuthUser): Promise<TimetableCheckResult> {
    const mutation = dto.slotId
      ? this.updateMutation(
          dto.slotId,
          {
            scope: dto.scope ?? 'this',
            date: dto.date,
            changes: dto.changes,
            exception: dto.exception,
          },
          user,
        )
      : this.createMutation(this.slotFromCheck(dto), user);
    try {
      await this.run(mutation, null);
    } catch (error) {
      if (error instanceof DryRun) return error.result;
      throw error;
    }
    throw new Error('unreachable');
  }

  /* Transaction ------------------------------------------------------------------------------- */

  private async commit(
    mutation: Mutation,
    acknowledged: readonly AcknowledgedWarning[],
  ): Promise<TimetableWriteResultDto> {
    const applied = await this.occupancy.guard(this.run(mutation, acknowledged));
    const ids = [applied.result.slotId, applied.result.endedSlotId].filter(
      (id): id is string => !!id,
    );
    const rows = ids.length
      ? await this.prisma.timetableSlot.findMany({
          where: { id: { in: ids } },
          include: slotInclude,
        })
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const slot = applied.result.slotId ? byId.get(applied.result.slotId) : undefined;
    const ended = applied.result.endedSlotId ? byId.get(applied.result.endedSlotId) : undefined;
    const exception = applied.result.exceptionId
      ? slot?.exceptions.find((e) => e.id === applied.result.exceptionId)
      : undefined;
    return {
      slot: slot ? toSlotDto(slot) : null,
      endedSlot: ended ? toSlotDto(ended) : null,
      exception: exception ? toExceptionDto(exception) : null,
      warnings: applied.warnings,
    };
  }

  /**
   * Runs a mutation, rewrites the index, detects conflicts and warnings. `acknowledged` null is a dry run:
   * the verdict leaves as a DryRun and nothing is saved.
   */
  private async run(
    mutation: Mutation,
    acknowledged: readonly AcknowledgedWarning[] | null,
  ): Promise<{ result: Applied; warnings: TimetableWarningDto[] }> {
    return this.prisma.$transaction(
      async (tx) => {
        const applied = await mutation(tx);
        await this.occupancy.clearSlots(tx, applied.touched);
        const rows = await this.occupancy.entriesForSlots(tx, applied.touched);
        const conflicts = await this.occupancy.detect(tx, rows);
        const warnings = await this.sessionWarnings(tx, applied);
        if (acknowledged === null)
          throw new DryRun({ conflicts, warnings, canSave: conflicts.length === 0 });
        if (conflicts.length) throw conflictBlocked(conflicts, warnings);
        const accepted = new Map(acknowledged.map((a) => [a.code, a.reason]));
        if (warnings.some((w) => !accepted.has(w.code))) throw warningsBlocked(warnings);
        await this.occupancy.insert(tx, rows);
        const reasons = warnings.map((w) => ({ code: w.code, reason: accepted.get(w.code) ?? '' }));
        await audit(
          tx,
          applied.audit.map((e, i) =>
            i === 0 && reasons.length
              ? { ...e, after: { ...(e.after as object), acknowledgedWarnings: reasons } }
              : e,
          ),
        );
        return { result: applied, warnings };
      },
      { timeout: 20_000 },
    );
  }

  private async sessionWarnings(tx: Db, applied: Applied): Promise<TimetableWarningDto[]> {
    if (!applied.warn.length) return [];
    const rows = await tx.timetableSlot.findMany({
      where: { id: { in: [...applied.warn] } },
      include: slotInclude,
    });
    const today = this.today();
    const sessions: TimetableOccurrence<ReturnType<typeof toSlotData>>[] = [];
    const ranges = rows.map((row) =>
      [
        toDay(row.validFrom),
        toDay(row.validTo),
        ...row.exceptions.flatMap((e) => (e.newDate ? [toDay(e.newDate)] : [])),
      ].sort(),
    );
    if (rows.length) {
      // One query for the holidays of every slot.
      const from = ranges.map((r) => r[0]!).sort()[0]!;
      const to = ranges
        .map((r) => r.at(-1)!)
        .sort()
        .at(-1)!;
      const closures = await loadClosures(tx, CLOSED_DAY_TYPES, from, to);
      rows.forEach((row, i) =>
        sessions.push(
          ...expandSlots([toSlotData(row)], ranges[i]![0]!, ranges[i]!.at(-1)!, closures),
        ),
      );
    }
    const wanted = applied.onlySession
      ? sessions.filter(
          (s) =>
            s.slot.id === applied.onlySession!.slotId &&
            s.originalDate === applied.onlySession!.date,
        )
      : sessions.filter((s) => s.current.date >= today);
    return this.warnings.forSessions(tx, wanted, applied.series);
  }

  /* Mutations --------------------------------------------------------------------------------- */

  private createMutation(input: TimetableSlotInput, user: AuthUser): Mutation {
    return async (tx) => {
      if (!canEditStructure(user)) throw forbidden();
      const valid = await this.validate(tx, input, null);
      const id = randomUUID();
      await tx.timetableSlot.create({ data: { id, ...slotData(valid), createdById: user.id } });
      return {
        touched: [id],
        warn: [id],
        onlySession: null,
        series: true,
        slotId: id,
        endedSlotId: null,
        exceptionId: null,
        audit: [this.entry(user, 'timetable_slot.create', 'timetable_slot', id, { ...valid })],
      };
    };
  }

  private updateMutation(
    id: string,
    req: {
      scope: SlotScope;
      date?: string;
      changes?: Partial<TimetableSlotInput>;
      exception?: SlotExceptionInput;
    },
    user: AuthUser,
  ): Mutation {
    return async (tx) => {
      const row = await this.load(tx, id);
      await this.authorize(row, user);
      if (req.scope === 'this') {
        if (!req.date || !req.exception)
          throw new BadRequestException('Indiquez la séance (date) et le changement (exception).');
        if (req.changes)
          throw new BadRequestException('Cette séance ne change que par une exception.');
        return this.writeException(
          tx,
          row,
          req.date,
          definedOnly(req.exception) as SlotExceptionInput,
          user,
        );
      }
      if (!canEditStructure(user)) throw forbidden();
      const changes = definedOnly(req.changes ?? {});
      if (req.exception || !Object.keys(changes).length)
        throw new BadRequestException('Indiquez les changements de la série (changes).');
      const today = this.today();
      if (toDay(row.validTo) < today) throw new BadRequestException('Cette série est terminée.');
      if (req.scope === 'all') {
        if (changes.validFrom !== undefined && toDay(row.validFrom) < today)
          throw new BadRequestException(
            'Cette série a commencé : son début ne change plus (les séances passées restent telles quelles).',
          );
        // The sessions already held stay as they were: the series is split at today when it began.
        return this.editFrom(
          tx,
          row,
          toDay(row.validFrom) >= today ? null : today,
          changes,
          user,
          'all',
        );
      }
      if (!req.date)
        throw new BadRequestException('Indiquez la séance à partir de laquelle changer.');
      if (req.date < today) throw new BadRequestException(PAST);
      if (changes.validFrom !== undefined && changes.validFrom !== req.date)
        throw new BadRequestException('Le début de la nouvelle série est la séance choisie.');
      this.assertInSeries(row, req.date);
      return this.editFrom(
        tx,
        row,
        req.date <= toDay(row.validFrom) ? null : req.date,
        changes,
        user,
        'following',
      );
    };
  }

  /**
   * Edits the series from `splitDay` on: in place when it is null (nothing before it), else the old slot
   * ends the day before and a new one starts on `splitDay` with the changes.
   */
  private async editFrom(
    tx: Db,
    row: SlotRow,
    splitDay: string | null,
    changes: Partial<TimetableSlotInput>,
    user: AuthUser,
    scope: 'following' | 'all',
  ): Promise<Applied> {
    const before = rowInput(row);
    // Changing the group derives the division from the new group (or the whole class without one).
    const base =
      changes.groupId !== undefined && changes.division === undefined
        ? { ...before, division: null }
        : before;
    if (!splitDay) {
      const merged = await this.validate(tx, { ...base, ...changes }, row);
      await tx.timetableSlot.update({ where: { id: row.id }, data: slotData(merged) });
      await this.pruneExceptions(tx, row.id);
      return {
        touched: [row.id],
        warn: [row.id],
        onlySession: null,
        series: true,
        slotId: row.id,
        endedSlotId: null,
        exceptionId: null,
        audit: [
          this.entry(
            user,
            'timetable_slot.update',
            'timetable_slot',
            row.id,
            { ...merged, scope },
            before,
          ),
        ],
      };
    }
    const merged = await this.validate(
      tx,
      { ...base, ...changes, validFrom: splitDay, validTo: changes.validTo ?? before.validTo },
      row,
    );
    const newId = randomUUID();
    await tx.timetableSlot.create({
      data: { id: newId, ...slotData(merged), createdById: user.id },
    });
    // The exceptions of the future sessions follow the new rule.
    await tx.slotException.updateMany({
      where: { slotId: row.id, date: { gte: fromDay(splitDay) } },
      data: { slotId: newId },
    });
    await tx.timetableSlot.update({
      where: { id: row.id },
      data: { validTo: fromDay(addDays(splitDay, -1)) },
    });
    await this.pruneExceptions(tx, newId);
    return {
      touched: [row.id, newId],
      warn: [newId],
      onlySession: null,
      series: true,
      slotId: newId,
      endedSlotId: row.id,
      exceptionId: null,
      audit: [
        this.entry(
          user,
          'timetable_slot.split',
          'timetable_slot',
          newId,
          { ...merged, from: row.id, scope },
          before,
        ),
        this.entry(
          user,
          'timetable_slot.end',
          'timetable_slot',
          row.id,
          { validTo: addDays(splitDay, -1) },
          { validTo: before.validTo },
        ),
      ],
    };
  }

  private removeMutation(
    id: string,
    scope: SlotScope,
    date: string | undefined,
    user: AuthUser,
  ): Mutation {
    return async (tx) => {
      if (!canEditStructure(user)) throw forbidden();
      const row = await this.load(tx, id);
      const today = this.today();
      if (scope === 'this') {
        if (!date) throw new BadRequestException('Indiquez la séance à annuler (date).');
        return this.writeException(tx, row, date, { kind: 'cancelled' }, user);
      }
      if (toDay(row.validTo) < today) throw new BadRequestException('Cette série est terminée.');
      let endsAt: string | null; // last day kept; null: delete the slot
      if (scope === 'following') {
        if (!date)
          throw new BadRequestException('Indiquez la séance à partir de laquelle supprimer.');
        if (date < today) throw new BadRequestException(PAST);
        this.assertInSeries(row, date);
        endsAt = date <= toDay(row.validFrom) ? null : addDays(date, -1);
      } else {
        endsAt = toDay(row.validFrom) >= today ? null : addDays(today, -1);
      }
      const before = rowInput(row);
      if (endsAt === null) {
        await tx.timetableSlot.delete({ where: { id } });
        return {
          touched: [],
          warn: [],
          onlySession: null,
          series: false,
          slotId: null,
          endedSlotId: null,
          exceptionId: null,
          audit: [
            this.entry(user, 'timetable_slot.delete', 'timetable_slot', id, { scope }, before),
          ],
        };
      }
      await tx.timetableSlot.update({ where: { id }, data: { validTo: fromDay(endsAt) } });
      await tx.slotException.deleteMany({ where: { slotId: id, date: { gt: fromDay(endsAt) } } });
      return {
        touched: [id],
        warn: [],
        onlySession: null,
        series: false,
        slotId: null,
        endedSlotId: id,
        exceptionId: null,
        audit: [
          this.entry(
            user,
            'timetable_slot.end',
            'timetable_slot',
            id,
            { validTo: endsAt, scope },
            { validTo: before.validTo },
          ),
        ],
      };
    };
  }

  /** One session changed: cancelled, moved, taken by a substitute, or in another room. */
  private async writeException(
    tx: Db,
    row: SlotRow,
    date: string,
    input: SlotExceptionInput,
    user: AuthUser,
  ): Promise<Applied> {
    await this.authorize(row, user);
    if (!canEditStructure(user)) {
      if (!TEACHER_KINDS.has(input.kind)) throw forbidden();
    }
    const problems = exceptionProblems(input);
    if (problems.length) throw new BadRequestException(problems[0]);
    const today = this.today();
    if (date < today) throw new BadRequestException(PAST);
    const slot = toSlotData(row);
    const [lo, hi] =
      input.newDate && input.newDate < date ? [input.newDate, date] : [date, input.newDate ?? date];
    const closures = await loadClosures(tx, CLOSED_DAY_TYPES, lo, hi);
    if (!slotRunsOn(slot, date, { closures, parityAnchor: slot.parityAnchor }))
      throw new BadRequestException(
        'Cette séance n’a pas lieu ce jour-là (autre jour, semaine de l’autre rythme ou jour sans cours).',
      );
    if (input.newDate) {
      if (input.newDate < today) throw new BadRequestException(PAST);
      if (
        closures.some(
          (c) =>
            c.startsOn <= input.newDate! &&
            input.newDate! <= c.endsOn &&
            closureCovers(c, slot.target),
        )
      )
        throw new BadRequestException('Ce jour est sans cours pour cette classe.');
    }
    if (input.newRoomId) {
      const room = await tx.room.findUnique({ where: { id: input.newRoomId } });
      if (!room) throw notFound('Salle');
      if (!room.active) throw new BadRequestException('Cette salle n’est plus utilisée.');
    }
    if (input.newTeacherId && !(await tx.teacher.findUnique({ where: { id: input.newTeacherId } })))
      throw notFound('Enseignant');
    const data = {
      kind: input.kind,
      newDate: input.newDate ? fromDay(input.newDate) : null,
      newStart: input.newStart ?? null,
      newEnd: input.newEnd ?? null,
      newRoomId: input.newRoomId ?? null,
      newTeacherId: input.newTeacherId ?? null,
      reason: input.reason ?? '',
      createdById: user.id,
    };
    const previous = row.exceptions.find((e) => toDay(e.date) === date);
    const saved = await tx.slotException.upsert({
      where: { slotId_date: { slotId: row.id, date: fromDay(date) } },
      create: { slotId: row.id, date: fromDay(date), ...data },
      update: data,
    });
    return {
      touched: [row.id],
      warn: [row.id],
      onlySession: { slotId: row.id, date },
      series: false,
      slotId: row.id,
      endedSlotId: null,
      exceptionId: saved.id,
      audit: [
        this.entry(
          user,
          'slot_exception.upsert',
          'slot_exception',
          saved.id,
          {
            slotId: row.id,
            date,
            kind: input.kind,
            newDate: input.newDate ?? null,
            newStart: input.newStart ?? null,
            newEnd: input.newEnd ?? null,
            newRoomId: input.newRoomId ?? null,
            newTeacherId: input.newTeacherId ?? null,
            reason: input.reason ?? '',
          },
          previous ? { kind: previous.kind } : undefined,
        ),
      ],
    };
  }

  /* Rules ------------------------------------------------------------------------------------- */

  private async load(tx: Db, id: string): Promise<SlotRow> {
    const row = await tx.timetableSlot.findUnique({ where: { id }, include: slotInclude });
    if (!row) throw notFound('Séance');
    return row;
  }

  /** Admins and coordinators edit everything; a teacher only the sessions they teach (their own slots and assignments). */
  private async authorize(row: SlotRow, user: AuthUser): Promise<void> {
    if (canEditStructure(user)) return;
    if (
      user.role === 'teacher' &&
      user.teacherId &&
      row.teacherId === user.teacherId &&
      (await this.access.teaches(
        user.teacherId,
        row.classSubject.classId,
        row.classSubject.subjectId,
      ))
    )
      return;
    throw forbidden();
  }

  private assertInSeries(row: SlotRow, date: string): void {
    const slot = toSlotData(row);
    if (!slotRunsOn(slot, date, { parityAnchor: slot.parityAnchor }))
      throw new BadRequestException('Cette date n’est pas une séance de la série.');
  }

  /** Deletes the exceptions that no longer match a session of the rule (other weekday, rhythm or range). */
  private async pruneExceptions(tx: Db, slotId: string): Promise<void> {
    const row = await this.load(tx, slotId);
    const slot = toSlotData(row);
    const stale = row.exceptions
      .filter((e) => !slotRunsOn(slot, toDay(e.date), { parityAnchor: slot.parityAnchor }))
      .map((e) => e.id);
    if (stale.length) await tx.slotException.deleteMany({ where: { id: { in: stale } } });
  }

  /** The business rules beyond the DTO's shape checks. `previous` is the stored slot when editing. */
  private async validate(
    tx: Db,
    input: TimetableSlotInput,
    previous: SlotRow | null,
  ): Promise<TimetableSlotInput> {
    const problems = slotProblems(input);
    if (problems.length) throw new BadRequestException(problems[0]);
    const classSubject = await tx.classSubject.findUnique({
      where: { id: input.classSubjectId },
      include: { schoolClass: { include: { schoolYear: true } } },
    });
    if (!classSubject) throw notFound('Matière de la classe');
    const year = classSubject.schoolClass.schoolYear;
    if (input.validFrom < toDay(year.startsOn) || input.validTo > toDay(year.endsOn))
      throw new BadRequestException(`Les dates doivent être comprises dans l’année ${year.label}.`);
    const assigned = await tx.teachingAssignment.count({
      where: { teacherId: input.teacherId, classSubjectId: input.classSubjectId },
    });
    if (!assigned)
      throw new BadRequestException(
        'Cet enseignant n’enseigne pas cette matière dans cette classe.',
      );
    if (input.roomId && input.roomId !== previous?.roomId) {
      const room = await tx.room.findUnique({ where: { id: input.roomId } });
      if (!room) throw notFound('Salle');
      if (!room.active) throw new BadRequestException('Cette salle n’est plus utilisée.');
    }
    const type = await tx.activityType.findUnique({ where: { id: input.activityTypeId } });
    if (!type) throw notFound('Type d’activité');
    if (type.id !== previous?.activityTypeId && (type.archivedAt || type.ownerTeacherId))
      throw new BadRequestException(
        'Ce type d’activité n’est pas disponible pour l’emploi du temps.',
      );
    if (!type.repeatable || type.homework)
      throw new BadRequestException(`Un « ${type.label} » ne se répète pas chaque semaine.`);
    if (!input.groupId) return { ...input, groupId: null };
    // A session for a group: the group is one of this class, and its division is the slot's division.
    // Read under a shared lock: a change of the group's division waits for this save (or the reverse).
    const [group] = await tx.$queryRaw<{ id: string; class_id: string; division: string }[]>`
      SELECT id, class_id, division FROM groups WHERE id = ${input.groupId}::uuid FOR SHARE`;
    if (!group) throw notFound('Groupe');
    if (group.class_id !== classSubject.classId)
      throw new BadRequestException('Ce groupe n’est pas un groupe de la classe de cette séance.');
    if (input.division && input.division !== group.division)
      throw new BadRequestException(
        `La division d’une séance de groupe est celle du groupe (« ${group.division} »).`,
      );
    return { ...input, division: group.division };
  }

  private slotFromCheck(dto: TimetableCheckDto): TimetableSlotInput {
    if (!dto.slot) throw new BadRequestException('Indiquez la séance à vérifier (slot).');
    return dto.slot;
  }

  private entry(
    user: AuthUser,
    action: string,
    entity: string,
    entityId: string,
    after: object,
    before?: object,
  ): AuditEntry {
    return {
      actorId: user.id,
      action,
      entity,
      entityId,
      after: after as Prisma.InputJsonValue,
      ...(before ? { before: before as Prisma.InputJsonValue } : {}),
    };
  }
}

function slotData(input: TimetableSlotInput) {
  return {
    classSubjectId: input.classSubjectId,
    teacherId: input.teacherId,
    roomId: input.roomId,
    activityTypeId: input.activityTypeId,
    weekday: input.weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    validFrom: fromDay(input.validFrom),
    validTo: fromDay(input.validTo),
    weekParity: input.weekParity,
    division: input.division,
    groupId: input.groupId ?? null,
  };
}

function rowInput(row: SlotRow): TimetableSlotInput {
  return {
    classSubjectId: row.classSubjectId,
    teacherId: row.teacherId,
    roomId: row.roomId,
    activityTypeId: row.activityTypeId,
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    validFrom: toDay(row.validFrom),
    validTo: toDay(row.validTo),
    weekParity: row.weekParity,
    division: row.division,
    groupId: row.groupId,
  };
}
