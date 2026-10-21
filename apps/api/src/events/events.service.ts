import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { daysBetween, occurrences, safeAttachments, toIcs } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { ActivityTypesService } from '../activity-types/activity-types.service.js';
import { CalendarDaysService } from '../calendar-days/calendar-days.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay } from '../common/dates.js';
import { forbidden, notFound } from '../common/errors.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateEventDto,
  EventDto,
  EventRangeQueryDto,
  OccurrenceDto,
  UpdateEventDto,
} from './dto/event.dto.js';
import { eventInclude, type EventRow, toCalendarEvent, toEventDto } from './event.mapper.js';

export const MAX_RANGE_DAYS = 186;
const MAX_REPEAT_DAYS = 366;

/** The fields of an event once defaults are applied, before writing it. */
type EventFields = Required<Omit<CreateEventDto, 'attachments'>> & {
  attachments: CreateEventDto['attachments'];
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly types: ActivityTypesService,
    private readonly periods: PeriodsService,
    private readonly calendarDays: CalendarDaysService,
    private readonly occupancy: OccupancyService,
  ) {}

  /** Events that take place in [from, to] and that the user may see. */
  async list(query: EventRangeQueryDto, user: AuthUser): Promise<EventDto[]> {
    return (await this.rows(query, user)).map(toEventDto);
  }

  /**
   * Every day each event happens in [from, to] (weekly events expanded), sorted by day and time. Weekly
   * sessions on a holiday or a « pas de cours » day of their audience are left out.
   */
  async occurrences(query: EventRangeQueryDto, user: AuthUser): Promise<OccurrenceDto[]> {
    const rows = await this.rows(query, user);
    const byId = new Map(rows.map((r) => [r.id, toEventDto(r)]));
    const closures = await this.calendarDays.closures(query.from, query.to);
    return occurrences(rows.map(toCalendarEvent), query.from, query.to, closures).map((o) => ({
      key: o.key,
      day: o.day,
      event: byId.get(o.event.id)!,
    }));
  }

  async get(id: string, user: AuthUser): Promise<EventDto> {
    return toEventDto(await this.visible(id, user));
  }

  /** The event as an iCalendar file (« Ajouter à mon agenda »); cancelled sessions become EXDATE lines. */
  async ics(id: string, user: AuthUser): Promise<string> {
    const row = await this.visible(id, user);
    const until = row.repeatUntil ? toDay(row.repeatUntil) : toDay(row.date);
    const closures = await this.calendarDays.closures(toDay(row.date), until);
    return toIcs(toCalendarEvent(row), closures);
  }

  /** Teachers create events for the classes they teach, or section/school-wide ungraded events. */
  async create(dto: CreateEventDto, user: AuthUser): Promise<EventDto> {
    if (!user.teacherId) throw forbidden();
    const fields = await this.check(withDefaults(dto), user, null);
    const row = await this.occupancy.guard(
      this.prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: { ...toData(fields), authorId: user.teacherId! },
          include: eventInclude,
        });
        // One-off events hold their room and class like a timetable session: a clash is a 409.
        await this.occupancy.indexEvent(tx, booking(created));
        return created;
      }),
    );
    return toEventDto(row);
  }

  /**
   * The author or an admin. Type and class can't change once grades exist, nor can the period they count
   * for; an event of a closed period is locked.
   */
  async update(id: string, dto: UpdateEventDto, user: AuthUser): Promise<EventDto> {
    const current = await this.editable(id, user);
    await this.periods.assertOpen(this.prisma, current.periodId);
    const patch = definedOnly(dto);
    // A new date or class re-derives the period, unless the caller names one or the stored period (a
    // semester picked by hand, say) still covers the new date of the same class.
    if (patch.periodId === undefined && (patch.date !== undefined || patch.classId !== undefined)) {
      patch.periodId = null;
      if (current.periodId && (patch.classId ?? current.classId) === current.classId) {
        const stored = await this.periods.find(current.periodId);
        const date = patch.date ?? toDay(current.date);
        if (toDay(stored.startsOn) <= date && date <= toDay(stored.endsOn))
          patch.periodId = current.periodId;
      }
    }
    const merged = withDefaults(merge(fromRow(current), patch));
    const hasGrades = (await this.prisma.grade.count({ where: { eventId: id } })) > 0;
    if (
      hasGrades &&
      (merged.activityTypeId !== current.activityTypeId ||
        merged.classId !== current.classId ||
        merged.subjectId !== current.subjectId)
    ) {
      throw new ConflictException(
        'Des notes existent : le type, la classe et la matière ne peuvent plus changer.',
      );
    }
    const fields = await this.check(merged, user, current);
    if (hasGrades && fields.periodId !== current.periodId) {
      throw new ConflictException(
        'Des notes existent : l’événement ne peut plus changer de période. Gardez la période ou supprimez les notes.',
      );
    }
    const row = await this.occupancy.guard(
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.event.update({
          where: { id },
          data: toData(fields),
          include: eventInclude,
        });
        await this.occupancy.indexEvent(tx, booking(updated));
        return updated;
      }),
    );
    return toEventDto(row);
  }

  /** The author or an admin; refused while the event still has grades. */
  async remove(id: string, user: AuthUser): Promise<void> {
    const current = await this.editable(id, user);
    await this.periods.assertOpen(this.prisma, current.periodId);
    if (await this.prisma.grade.count({ where: { eventId: id } })) {
      throw new ConflictException('Supprimez d’abord les notes de cet événement.');
    }
    await this.prisma.event.delete({ where: { id } });
  }

  /** An event the user may see (students: only their audience), or 404. */
  async visible(id: string, user: AuthUser): Promise<EventRow> {
    const audience = user.studentId
      ? this.access.audienceFor(await this.access.placement(user.studentId))
      : {};
    const row = await this.prisma.event.findFirst({
      where: { id, ...audience },
      include: eventInclude,
    });
    if (!row) throw notFound('Événement');
    return row;
  }

  private async rows(query: EventRangeQueryDto, user: AuthUser): Promise<EventRow[]> {
    if (query.to < query.from) throw new BadRequestException('« to » doit suivre « from ».');
    if (daysBetween(query.from, query.to) > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Période limitée à ${MAX_RANGE_DAYS} jours.`);
    }
    const inRange: Prisma.EventWhereInput = {
      date: { lte: fromDay(query.to) },
      OR: [
        { repeatUntil: { gte: fromDay(query.from) } },
        { repeatUntil: null, date: { gte: fromDay(query.from) } },
      ],
    };
    return this.prisma.event.findMany({
      where: { AND: [inRange, await this.audience(query, user)] },
      include: eventInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  private async audience(
    query: EventRangeQueryDto,
    user: AuthUser,
  ): Promise<Prisma.EventWhereInput> {
    if (user.studentId) return this.access.audienceFor(await this.access.placement(user.studentId));
    const wholeSchool = { classId: null, sectionId: null };
    if (query.classId) {
      const c = await this.prisma.schoolClass.findUnique({ where: { id: query.classId } });
      if (!c) throw notFound('Classe');
      return { OR: [wholeSchool, { classId: null, sectionId: c.sectionId }, { classId: c.id }] };
    }
    if (query.sectionId) {
      return {
        OR: [
          wholeSchool,
          { sectionId: query.sectionId },
          { schoolClass: { sectionId: query.sectionId } },
        ],
      };
    }
    return {};
  }

  private async editable(id: string, user: AuthUser): Promise<EventRow> {
    const row = await this.prisma.event.findUnique({ where: { id }, include: eventInclude });
    if (!row) throw notFound('Événement');
    if (user.role !== 'admin' && row.authorId !== user.teacherId) throw forbidden();
    return row;
  }

  /** Business rules beyond the DTO's shape checks. `current` is the stored event when updating. */
  private async check(
    input: EventFields,
    user: AuthUser,
    current: EventRow | null,
  ): Promise<EventFields> {
    const type = await this.types.usable(input.activityTypeId, user, current?.activityTypeId);
    // A type that is not graded has no coefficient: moving an event to one resets it.
    const f =
      !type.gradable && current && current.activityTypeId !== input.activityTypeId
        ? { ...input, coefficient: 1 }
        : input;
    if (f.classId && f.sectionId)
      throw new BadRequestException('Choisissez une classe ou une section, pas les deux.');
    if (!f.startTime && f.endTime)
      throw new BadRequestException('Une heure de fin demande une heure de début.');
    if (f.startTime && f.endTime && f.endTime <= f.startTime)
      throw new BadRequestException('La fin doit suivre le début.');
    if (f.repeatUntil) {
      if (!type.repeatable)
        throw new BadRequestException(`Un événement « ${type.label} » ne se répète pas.`);
      if (f.repeatUntil < f.date)
        throw new BadRequestException('La répétition doit finir après le premier jour.');
      if (daysBetween(f.date, f.repeatUntil) > MAX_REPEAT_DAYS)
        throw new BadRequestException('Répétition limitée à un an.');
    }
    if (type.gradable && !f.classId)
      throw new BadRequestException('Un événement noté vise une classe.');
    if (!type.gradable && f.coefficient !== 1)
      throw new BadRequestException('Seuls les événements notés ont un coefficient.');
    if (f.roomId && f.roomId !== current?.roomId) {
      const room = await this.prisma.room.findUnique({ where: { id: f.roomId } });
      if (!room) throw notFound('Salle');
      if (!room.active) throw new BadRequestException('Cette salle n’est plus utilisée.');
    }
    if (f.subjectId && !(await this.prisma.subject.findUnique({ where: { id: f.subjectId } })))
      throw notFound('Matière');
    if (f.sectionId && !(await this.prisma.section.findUnique({ where: { id: f.sectionId } })))
      throw notFound('Section');
    if (f.classId) {
      if (!(await this.prisma.schoolClass.findUnique({ where: { id: f.classId } })))
        throw notFound('Classe');
      await this.access.assertTeachesClass(user, f.classId, f.subjectId);
      // A graded event counts in a subject of the class: report cards only weigh the class's subjects.
      if (
        type.gradable &&
        (!current || current.subjectId !== f.subjectId || current.classId !== f.classId)
      ) {
        if (!f.subjectId)
          throw new BadRequestException('Un événement noté a besoin d’une matière.');
        const taught = await this.prisma.classSubject.findUnique({
          where: { classId_subjectId: { classId: f.classId, subjectId: f.subjectId } },
        });
        if (!taught)
          throw new BadRequestException('Cette matière n’est pas enseignée dans cette classe.');
      }
    }
    const attachments = safeAttachments(f.attachments ?? []);
    if (attachments.length !== (f.attachments ?? []).length)
      throw new BadRequestException('Liens https uniquement.');
    // Gradable events count for a period (report cards read it, never the dates).
    // An old graded event no period covered keeps no period while its date, class and type stay as they are.
    const legacyWithoutPeriod =
      !!current &&
      current.periodId === null &&
      f.periodId === null &&
      f.date === toDay(current.date) &&
      f.classId === current.classId &&
      f.activityTypeId === current.activityTypeId;
    const periodId =
      type.gradable && f.classId && !legacyWithoutPeriod
        ? (await this.periods.resolveFor(this.prisma, f.classId, f.date, f.periodId)).id
        : null;
    return { ...f, attachments, periodId };
  }
}

/** What the occupancy index needs of an event. */
function booking(row: EventRow) {
  return {
    id: row.id,
    date: toDay(row.date),
    startTime: row.startTime,
    endTime: row.endTime,
    repeatUntil: row.repeatUntil ? toDay(row.repeatUntil) : null,
    roomId: row.roomId,
    classId: row.classId,
    homework: row.activityType.homework,
  };
}

function withDefaults(dto: CreateEventDto): EventFields {
  return {
    activityTypeId: dto.activityTypeId,
    title: dto.title,
    subjectId: dto.subjectId ?? null,
    classId: dto.classId ?? null,
    sectionId: dto.sectionId ?? null,
    date: dto.date,
    startTime: dto.startTime ?? null,
    endTime: dto.endTime ?? null,
    repeatUntil: dto.repeatUntil ?? null,
    roomId: dto.roomId ?? null,
    place: dto.place ?? '',
    periodId: dto.periodId ?? null,
    description: dto.description ?? '',
    attachments: dto.attachments ?? [],
    coefficient: dto.coefficient ?? 1,
  };
}

/** DTO instances carry every declared field, unset ones as undefined: keep only what was sent. */
function definedOnly<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function merge(base: CreateEventDto, patch: Partial<CreateEventDto>): CreateEventDto {
  return Object.assign({}, base, patch);
}

function fromRow(row: EventRow): CreateEventDto {
  const e = toEventDto(row);
  return {
    activityTypeId: e.activityTypeId,
    title: e.title,
    subjectId: e.subjectId,
    classId: e.classId,
    sectionId: e.sectionId,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    repeatUntil: e.repeatUntil,
    roomId: e.roomId,
    place: e.place,
    periodId: e.periodId,
    description: e.description,
    attachments: [...e.attachments],
    coefficient: e.coefficient,
  };
}

function toData(f: EventFields) {
  return {
    activityTypeId: f.activityTypeId,
    title: f.title,
    subjectId: f.subjectId,
    classId: f.classId,
    sectionId: f.sectionId,
    date: fromDay(f.date),
    startTime: f.startTime,
    endTime: f.endTime,
    repeatUntil: f.repeatUntil ? fromDay(f.repeatUntil) : null,
    roomId: f.roomId,
    periodId: f.periodId,
    place: f.place,
    description: f.description,
    attachments: (f.attachments ?? []).map((a) => ({ label: a.label, url: a.url })),
    coefficient: f.coefficient,
  };
}
