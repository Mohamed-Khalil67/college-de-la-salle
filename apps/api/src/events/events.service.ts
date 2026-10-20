import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { daysBetween, kindInfo, occurrences, safeAttachments, toIcs } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay } from '../common/dates.js';
import { forbidden, notFound } from '../common/errors.js';
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
  ) {}

  /** Events that take place in [from, to] and that the user may see. */
  async list(query: EventRangeQueryDto, user: AuthUser): Promise<EventDto[]> {
    return (await this.rows(query, user)).map(toEventDto);
  }

  /** Every day each event happens in [from, to] (weekly events expanded), sorted by day and time. */
  async occurrences(query: EventRangeQueryDto, user: AuthUser): Promise<OccurrenceDto[]> {
    const rows = await this.rows(query, user);
    const byId = new Map(rows.map((r) => [r.id, toEventDto(r)]));
    return occurrences(rows.map(toCalendarEvent), query.from, query.to).map((o) => ({
      key: o.key,
      day: o.day,
      event: byId.get(o.event.id)!,
    }));
  }

  async get(id: string, user: AuthUser): Promise<EventDto> {
    return toEventDto(await this.visible(id, user));
  }

  /** The event as an iCalendar file (« Ajouter à mon agenda »). */
  async ics(id: string, user: AuthUser): Promise<string> {
    return toIcs(toCalendarEvent(await this.visible(id, user)));
  }

  /** Teachers create events for the classes they teach, or section/school-wide ungraded events. */
  async create(dto: CreateEventDto, user: AuthUser): Promise<EventDto> {
    if (!user.teacherId) throw forbidden();
    const fields = await this.check(withDefaults(dto), user);
    const row = await this.prisma.event.create({
      data: { ...toData(fields), authorId: user.teacherId },
      include: eventInclude,
    });
    return toEventDto(row);
  }

  /** The author or an admin. Kind and class can't change once grades exist. */
  async update(id: string, dto: UpdateEventDto, user: AuthUser): Promise<EventDto> {
    const current = await this.editable(id, user);
    const merged = withDefaults(merge(fromRow(current), definedOnly(dto)));
    if (merged.kind !== current.kind || merged.classId !== current.classId) {
      if (await this.prisma.grade.count({ where: { eventId: id } })) {
        throw new ConflictException(
          'Des notes existent : le type et la classe ne peuvent plus changer.',
        );
      }
    }
    const fields = await this.check(merged, user);
    const row = await this.prisma.event.update({
      where: { id },
      data: toData(fields),
      include: eventInclude,
    });
    return toEventDto(row);
  }

  /** The author or an admin; refused while the event still has grades. */
  async remove(id: string, user: AuthUser): Promise<void> {
    await this.editable(id, user);
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

  /** Business rules beyond the DTO's shape checks. */
  private async check(f: EventFields, user: AuthUser): Promise<EventFields> {
    const kind = kindInfo(f.kind);
    if (f.classId && f.sectionId)
      throw new BadRequestException('Choisissez une classe ou une section, pas les deux.');
    if (!f.startTime && f.endTime)
      throw new BadRequestException('Une heure de fin demande une heure de début.');
    if (f.startTime && f.endTime && f.endTime <= f.startTime)
      throw new BadRequestException('La fin doit suivre le début.');
    if (f.repeatUntil) {
      if (!kind.repeatable)
        throw new BadRequestException(`Un événement « ${kind.label} » ne se répète pas.`);
      if (f.repeatUntil < f.date)
        throw new BadRequestException('La répétition doit finir après le premier jour.');
      if (daysBetween(f.date, f.repeatUntil) > MAX_REPEAT_DAYS)
        throw new BadRequestException('Répétition limitée à un an.');
    }
    if (kind.gradable && !f.classId)
      throw new BadRequestException('Un événement noté vise une classe.');
    if (!kind.gradable && f.coefficient !== 1)
      throw new BadRequestException('Seuls les événements notés ont un coefficient.');
    if (f.subjectId && !(await this.prisma.subject.findUnique({ where: { id: f.subjectId } })))
      throw notFound('Matière');
    if (f.sectionId && !(await this.prisma.section.findUnique({ where: { id: f.sectionId } })))
      throw notFound('Section');
    if (f.classId) {
      if (!(await this.prisma.schoolClass.findUnique({ where: { id: f.classId } })))
        throw notFound('Classe');
      await this.access.assertTeachesClass(user, f.classId, f.subjectId);
    }
    const attachments = safeAttachments(f.attachments ?? []);
    if (attachments.length !== (f.attachments ?? []).length)
      throw new BadRequestException('Liens https uniquement.');
    return { ...f, attachments };
  }
}

function withDefaults(dto: CreateEventDto): EventFields {
  return {
    kind: dto.kind,
    title: dto.title,
    subjectId: dto.subjectId ?? null,
    classId: dto.classId ?? null,
    sectionId: dto.sectionId ?? null,
    date: dto.date,
    startTime: dto.startTime ?? null,
    endTime: dto.endTime ?? null,
    repeatUntil: dto.repeatUntil ?? null,
    place: dto.place ?? '',
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
    kind: e.kind,
    title: e.title,
    subjectId: e.subjectId,
    classId: e.classId,
    sectionId: e.sectionId,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    repeatUntil: e.repeatUntil,
    place: e.place,
    description: e.description,
    attachments: [...e.attachments],
    coefficient: e.coefficient,
  };
}

function toData(f: EventFields) {
  return {
    kind: f.kind,
    title: f.title,
    subjectId: f.subjectId,
    classId: f.classId,
    sectionId: f.sectionId,
    date: fromDay(f.date),
    startTime: f.startTime,
    endTime: f.endTime,
    repeatUntil: f.repeatUntil ? fromDay(f.repeatUntil) : null,
    place: f.place,
    description: f.description,
    attachments: (f.attachments ?? []).map((a) => ({ label: a.label, url: a.url })),
    coefficient: f.coefficient,
  };
}
