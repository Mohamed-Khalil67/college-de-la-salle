import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  type AssessmentTargetInput,
  entriesOf,
  type EventDto,
  targetedStudentIds,
  type TargetContext,
  type TargetEntry,
} from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { notFound } from '../common/errors.js';
import { toStudentSummary } from '../classes/classes.service.js';
import type { StudentSummaryDto } from '../classes/dto/class.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toEntries } from './target.mapper.js';

type Db = Prisma.TransactionClient;

/** What decides whether an event can carry a target: a class, and an assessment or a homework. */
export interface TargetableEvent {
  readonly id: string;
  readonly classId: string | null;
  readonly activityType: { readonly gradable: boolean; readonly homework: boolean };
}

/** Only the assessments and the homework of a class are assigned to groups or students. */
export function supportsTarget(event: Pick<TargetableEvent, 'classId' | 'activityType'>): boolean {
  return !!event.classId && (event.activityType.gradable || event.activityType.homework);
}

/** What `annotate` reads of an event DTO (the API's class and the shared contract both fit). */
type EventShape = Pick<EventDto, 'id' | 'classId' | 'type' | 'target'>;

const NOT_SUPPORTED =
  'L’assignation à des groupes ou à des élèves concerne les devoirs et les évaluations d’une classe.';

/**
 * « Assigner à »: who a piece of work concerns. The target is stored (the whole class, groups, students);
 * the students it concerns are computed here, in ONE place, from the target and today's rosters (the pure
 * rule is `targetedStudentIds` in @cdls/shared). Grade sheets, attendance sheets, homework and the
 * calendar all ask this service, so a student who joins a group later is included and one who leaves is not.
 */
@Injectable()
export class TargetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The students the work concerns today, in the class list's order. For an event that is not an
   * assessment or a homework of a class, the whole class (events of a class with no target row too).
   */
  async concerned(
    db: Db,
    event: Pick<TargetableEvent, 'id' | 'classId'>,
  ): Promise<{ students: StudentSummaryDto[]; entries: TargetEntry[] }> {
    if (!event.classId) return { students: [], entries: [] };
    const rows = await db.assessmentTarget.findMany({ where: { eventId: event.id } });
    const entries = toEntries(rows);
    const roster = await this.roster(db, event.classId);
    const context = await this.context(db, roster, entries);
    const ids = new Set(targetedStudentIds(entries, context));
    return { students: roster.filter((s) => ids.has(s.id)), entries };
  }

  /** The ids the work concerns today; `null` stands for « no event class » (nobody to list). */
  async concernedIds(db: Db, event: Pick<TargetableEvent, 'id' | 'classId'>): Promise<string[]> {
    return (await this.concerned(db, event)).students.map((s) => s.id);
  }

  /**
   * Fills `target.concerned` of event DTOs (one query for the rosters, one for the memberships) and, for
   * a student, hides who else was named: a student only learns the groups.
   */
  async annotate<T extends EventShape>(dtos: readonly T[], user: AuthUser): Promise<T[]> {
    const todo = dtos.filter((d) => supportsTarget({ classId: d.classId, activityType: d.type }));
    const counts = await this.counts(todo);
    return dtos.map((d) => {
      const count = counts.get(d.id);
      if (count === undefined && user.role !== 'student') return d;
      return {
        ...d,
        target: {
          ...d.target,
          studentIds: user.role === 'student' ? [] : d.target.studentIds,
          concerned: count ?? d.target.concerned,
        },
      } as T;
    });
  }

  /** The number of students each (supported) event concerns, batched by class. */
  private async counts(
    events: readonly Pick<EventDto, 'id' | 'classId' | 'target'>[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!events.length) return out;
    const classIds = [...new Set(events.map((e) => e.classId!))];
    const groupIds = [...new Set(events.flatMap((e) => e.target.groups.map((g) => g.id)))];
    const enrolments = await this.prisma.enrollment.findMany({
      where: { classId: { in: classIds }, leftOn: null },
      select: { classId: true, studentId: true },
    });
    const byClass = new Map<string, string[]>();
    for (const e of enrolments) byClass.set(e.classId, [...(byClass.get(e.classId) ?? []), e.studentId]);
    const members = groupIds.length
      ? await this.prisma.groupMember.findMany({
          where: { groupId: { in: groupIds }, leftOn: null },
          select: { groupId: true, studentId: true },
        })
      : [];
    const byGroup = new Map<string, string[]>();
    for (const m of members) byGroup.set(m.groupId, [...(byGroup.get(m.groupId) ?? []), m.studentId]);
    for (const e of events) {
      const entries: TargetEntry[] = [
        ...e.target.groups.map((g) => ({ scope: 'group' as const, groupId: g.id })),
        ...e.target.studentIds.map((studentId) => ({ scope: 'student' as const, studentId })),
      ];
      out.set(
        e.id,
        targetedStudentIds(entries, {
          classStudentIds: byClass.get(e.classId!) ?? [],
          groupMembers: byGroup,
        }).length,
      );
    }
    return out;
  }

  /**
   * Stores the target of an event inside the caller's transaction (called after the event is saved).
   * - not an assessment or homework of a class: no target (a non-empty request is refused);
   * - `input` undefined on an update: unchanged, unless the class changed (then the whole class);
   * - groups must belong to the event's class and students be enrolled in it;
   * - taking out a student who already has a grade is refused (409): grades are never deleted silently.
   */
  async write(
    tx: Db,
    event: TargetableEvent,
    input: AssessmentTargetInput | undefined,
    options: { readonly classChanged?: boolean } = {},
  ): Promise<void> {
    const wants = !!input && (input.groupIds.length > 0 || input.studentIds.length > 0);
    if (!supportsTarget(event)) {
      if (wants) throw new BadRequestException(NOT_SUPPORTED);
      await tx.assessmentTarget.deleteMany({ where: { eventId: event.id } });
      return;
    }
    const classId = event.classId!;
    const current = await tx.assessmentTarget.findMany({ where: { eventId: event.id } });
    if (input === undefined && current.length && !options.classChanged) return;

    const wanted = entriesOf(input ?? { groupIds: [], studentIds: [] });
    await this.validate(tx, classId, wanted);

    if (!options.classChanged) {
      const roster = await this.roster(tx, classId);
      // No row at all means the whole class: narrowing it must respect the marks already given too.
      const before: TargetEntry[] = current.length ? toEntries(current) : [{ scope: 'class' }];
      const context = await this.context(tx, roster, [...before, ...wanted]);
      const keep = new Set(targetedStudentIds(wanted, context));
      const removed = targetedStudentIds(before, context).filter((id) => !keep.has(id));
      if (removed.length) {
        const graded = await tx.grade.findMany({
          where: { eventId: event.id, studentId: { in: removed } },
          select: { studentId: true },
        });
        if (graded.length) {
          const names = roster
            .filter((s) => graded.some((g) => g.studentId === s.id))
            .map((s) => `${s.firstName} ${s.lastName}`);
          throw new ConflictException(
            `${names.length > 1 ? 'Ces élèves ont déjà une note' : 'Cet élève a déjà une note'} (${list(names)}) : ${names.length > 1 ? 'ils ne peuvent' : 'il ne peut'} plus être retiré${names.length > 1 ? 's' : ''} de l’assignation. Supprimez d’abord ${names.length > 1 ? 'leurs notes' : 'sa note'} dans la feuille de notes, ou gardez-${names.length > 1 ? 'les' : 'le'} concerné${names.length > 1 ? 's' : ''}.`,
          );
        }
      }
    }
    await tx.assessmentTarget.deleteMany({ where: { eventId: event.id } });
    await tx.assessmentTarget.createMany({
      data: wanted.map((e) => ({
        eventId: event.id,
        scope: e.scope,
        groupId: e.groupId ?? null,
        studentId: e.studentId ?? null,
      })),
    });
  }

  /** Groups of this class and students enrolled in it, or a clear refusal. */
  private async validate(tx: Db, classId: string, entries: readonly TargetEntry[]): Promise<void> {
    const groupIds = entries.flatMap((e) => (e.scope === 'group' && e.groupId ? [e.groupId] : []));
    if (groupIds.length) {
      const groups = await tx.group.findMany({ where: { id: { in: groupIds } } });
      if (groups.length !== groupIds.length) throw notFound('Groupe');
      const foreign = groups.find((g) => g.classId !== classId);
      if (foreign)
        throw new BadRequestException(
          `Le groupe « ${foreign.division} — ${foreign.label} » n’est pas un groupe de cette classe.`,
        );
    }
    const studentIds = entries.flatMap((e) =>
      e.scope === 'student' && e.studentId ? [e.studentId] : [],
    );
    if (studentIds.length) {
      const enrolled = await tx.enrollment.count({
        where: { classId, leftOn: null, studentId: { in: studentIds } },
      });
      if (enrolled !== studentIds.length)
        throw new BadRequestException('Un des élèves choisis n’est pas inscrit dans cette classe.');
    }
  }

  private async roster(db: Db, classId: string): Promise<StudentSummaryDto[]> {
    const rows = await db.enrollment.findMany({
      where: { classId, leftOn: null },
      include: { student: { include: { user: true } } },
      orderBy: [
        { student: { user: { lastName: 'asc' } } },
        { student: { user: { firstName: 'asc' } } },
      ],
    });
    return rows.map((e) => toStudentSummary(e.student));
  }

  /** The rosters the pure helper needs: the class list and the current members of the groups named. */
  private async context(
    db: Db,
    roster: readonly StudentSummaryDto[],
    entries: readonly TargetEntry[],
  ): Promise<TargetContext> {
    const groupIds = [
      ...new Set(entries.flatMap((e) => (e.scope === 'group' && e.groupId ? [e.groupId] : []))),
    ];
    const members = groupIds.length
      ? await db.groupMember.findMany({
          where: { groupId: { in: groupIds }, leftOn: null },
          select: { groupId: true, studentId: true },
        })
      : [];
    const byGroup = new Map<string, string[]>();
    for (const m of members) byGroup.set(m.groupId, [...(byGroup.get(m.groupId) ?? []), m.studentId]);
    return { classStudentIds: roster.map((s) => s.id), groupMembers: byGroup };
  }
}

function list(names: readonly string[]): string {
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${shown} et ${names.length - 3} autre${names.length > 4 ? 's' : ''}` : shown;
}
