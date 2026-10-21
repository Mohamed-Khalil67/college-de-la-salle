import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CLOSED_DAY_TYPES,
  daysBetween,
  type CalendarDayType,
  classTarget,
  type Closure,
  type SectionId,
} from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CalendarDayDto,
  CalendarDayQueryDto,
  CreateCalendarDayDto,
  UpdateCalendarDayDto,
} from './dto/calendar-day.dto.js';

const include = {
  classes: { select: { classId: true } },
  section: true,
  schoolYear: true,
} satisfies Prisma.CalendarDayInclude;

const MAX_RANGE_DAYS = 400;

type Row = Prisma.CalendarDayGetPayload<{ include: typeof include }>;

/** Holidays, exam weeks, days without classes and special days of a school year. */
@Injectable()
export class CalendarDaysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The year's days, or those overlapping [from, to] (at most a year and a bit), by start day. A year or a
   * range is required. A student only gets what concerns them: days for the whole school, their section
   * or their class, and of the classes a day names, only their own.
   */
  async list(query: CalendarDayQueryDto, user: AuthUser): Promise<CalendarDayDto[]> {
    if (!query.schoolYearId && !(query.from && query.to))
      throw new BadRequestException('Indiquez une année scolaire, ou une période (from et to).');
    if (query.from && query.to) {
      if (query.to < query.from) throw new BadRequestException('« to » doit suivre « from ».');
      if (daysBetween(query.from, query.to) > MAX_RANGE_DAYS)
        throw new BadRequestException(`Période limitée à ${MAX_RANGE_DAYS} jours.`);
    }
    const student = user.role === 'student';
    const rows = await this.prisma.calendarDay.findMany({
      where: {
        ...(query.schoolYearId ? { schoolYearId: query.schoolYearId } : {}),
        ...(query.from ? { endsOn: { gte: fromDay(query.from) } } : {}),
        ...(query.to ? { startsOn: { lte: fromDay(query.to) } } : {}),
        ...(student
          ? {
              AND: [
                {
                  OR: [
                    { sectionId: null },
                    ...(user.sectionCode ? [{ section: { code: user.sectionCode } }] : []),
                  ],
                },
                {
                  OR: [
                    { classes: { none: {} } },
                    ...(user.classId ? [{ classes: { some: { classId: user.classId } } }] : []),
                  ],
                },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ startsOn: 'asc' }, { label: 'asc' }],
    });
    return rows.map((row) => {
      const dto = toCalendarDayDto(row);
      return student ? { ...dto, classIds: dto.classIds.filter((id) => id === user.classId) } : dto;
    });
  }

  async create(dto: CreateCalendarDayDto, user: AuthUser): Promise<CalendarDayDto> {
    const classIds = dto.classIds ?? [];
    await this.check(dto.schoolYearId, dto.startsOn, dto.endsOn, dto.sectionId ?? null, classIds);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.calendarDay.create({
        data: {
          schoolYearId: dto.schoolYearId,
          type: dto.type,
          label: dto.label,
          startsOn: fromDay(dto.startsOn),
          endsOn: fromDay(dto.endsOn),
          sectionId: dto.sectionId ?? null,
          classes: { create: classIds.map((classId) => ({ classId })) },
        },
        include,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'calendar_day.create',
          entity: 'calendar_day',
          entityId: row.id,
          after: snapshot(row),
        },
      ]);
      return toCalendarDayDto(row);
    });
  }

  async update(id: string, dto: UpdateCalendarDayDto, user: AuthUser): Promise<CalendarDayDto> {
    const current = await this.find(id);
    const merged = {
      startsOn: dto.startsOn ?? toDay(current.startsOn),
      endsOn: dto.endsOn ?? toDay(current.endsOn),
      sectionId: dto.sectionId === undefined ? current.sectionId : dto.sectionId,
      classIds: dto.classIds ?? current.classes.map((c) => c.classId),
    };
    await this.check(
      current.schoolYearId,
      merged.startsOn,
      merged.endsOn,
      merged.sectionId,
      merged.classIds,
    );
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.calendarDay.update({
        where: { id },
        data: {
          type: dto.type,
          label: dto.label,
          startsOn: fromDay(merged.startsOn),
          endsOn: fromDay(merged.endsOn),
          sectionId: merged.sectionId,
          ...(dto.classIds
            ? { classes: { deleteMany: {}, create: dto.classIds.map((classId) => ({ classId })) } }
            : {}),
        },
        include,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'calendar_day.update',
          entity: 'calendar_day',
          entityId: id,
          before: snapshot(current),
          after: snapshot(row),
        },
      ]);
      return toCalendarDayDto(row);
    });
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const current = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarDay.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'calendar_day.delete',
          entity: 'calendar_day',
          entityId: id,
          before: snapshot(current),
        },
      ]);
    });
  }

  /**
   * The days without classes (holiday, no_classes) that touch [from, to], as audiences in the shared
   * model's notation (`all`, `bac`, `bac-premiere`), for occurrences() and the .ics export.
   */
  async closures(from: string, to: string): Promise<Closure[]> {
    const rows = await this.prisma.calendarDay.findMany({
      where: {
        type: { in: [...CLOSED_DAY_TYPES] as CalendarDayType[] },
        startsOn: { lte: fromDay(to) },
        endsOn: { gte: fromDay(from) },
      },
      include: {
        section: true,
        classes: { include: { schoolClass: { include: { section: true } } } },
      },
    });
    return rows.map((r) => ({
      startsOn: toDay(r.startsOn),
      endsOn: toDay(r.endsOn),
      targets: r.classes.length
        ? r.classes.map((c) =>
            classTarget(c.schoolClass.section.code as SectionId, c.schoolClass.code),
          )
        : [r.section?.code ?? 'all'],
    }));
  }

  private async find(id: string): Promise<Row> {
    const row = await this.prisma.calendarDay.findUnique({ where: { id }, include });
    if (!row) throw notFound('Jour du calendrier');
    return row;
  }

  /** Dates inside the school year; a section that exists; classes of that year (and section). */
  private async check(
    schoolYearId: string,
    startsOn: string,
    endsOn: string,
    sectionId: string | null,
    classIds: readonly string[],
  ): Promise<void> {
    const year = await this.prisma.schoolYear.findUnique({ where: { id: schoolYearId } });
    if (!year) throw notFound('Année scolaire');
    if (endsOn < startsOn) throw new BadRequestException('La fin ne peut pas précéder le début.');
    if (startsOn < toDay(year.startsOn) || endsOn > toDay(year.endsOn))
      throw new BadRequestException(`Les dates doivent être comprises dans l’année ${year.label}.`);
    if (sectionId && !(await this.prisma.section.findUnique({ where: { id: sectionId } })))
      throw notFound('Section');
    if (classIds.length) {
      const classes = await this.prisma.schoolClass.findMany({
        where: { id: { in: [...classIds] }, schoolYearId, ...(sectionId ? { sectionId } : {}) },
        select: { id: true },
      });
      if (classes.length !== classIds.length)
        throw new BadRequestException(
          'Les classes doivent appartenir à cette année scolaire (et à la section choisie).',
        );
    }
  }
}

function snapshot(r: Row) {
  return {
    type: r.type,
    label: r.label,
    startsOn: toDay(r.startsOn),
    endsOn: toDay(r.endsOn),
    sectionId: r.sectionId,
    classIds: r.classes.map((c) => c.classId).sort(),
  };
}

export function toCalendarDayDto(r: Row): CalendarDayDto {
  return {
    id: r.id,
    schoolYearId: r.schoolYearId,
    type: r.type,
    label: r.label,
    startsOn: toDay(r.startsOn),
    endsOn: toDay(r.endsOn),
    sectionId: r.sectionId,
    classIds: r.classes.map((c) => c.classId).sort(),
  };
}
