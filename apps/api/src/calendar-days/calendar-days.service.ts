import { BadRequestException, Injectable } from '@nestjs/common';
import { CLOSED_DAY_TYPES, type Closure } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';
import { loadClosures } from './closures.js';
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

/** A holiday can rewrite the index of many slots. */
const TX = { timeout: 30_000 };

const include = {
  classes: { select: { classId: true } },
  section: true,
  schoolYear: true,
} satisfies Prisma.CalendarDayInclude;

type Row = Prisma.CalendarDayGetPayload<{ include: typeof include }>;

/** Holidays, exam weeks, days without classes and special days of a school year. */
@Injectable()
export class CalendarDaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
  ) {}

  /** The year's days (or those overlapping [from, to]), by start day. */
  async list(query: CalendarDayQueryDto): Promise<CalendarDayDto[]> {
    const rows = await this.prisma.calendarDay.findMany({
      where: {
        ...(query.schoolYearId ? { schoolYearId: query.schoolYearId } : {}),
        ...(query.from ? { endsOn: { gte: fromDay(query.from) } } : {}),
        ...(query.to ? { startsOn: { lte: fromDay(query.to) } } : {}),
      },
      include,
      orderBy: [{ startsOn: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toCalendarDayDto);
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
      await this.reindex(tx, row);
      return toCalendarDayDto(row);
    }, TX);
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
      await this.reindex(tx, current, row);
      return toCalendarDayDto(row);
    }, TX);
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
      await this.reindex(tx, current);
    }, TX);
  }

  /**
   * Holidays and days without classes remove sessions from the timetable: the occupancy index of the slots
   * they touch is rewritten in the same transaction (a removed holiday can bring back a clash: 409).
   */
  private async reindex(tx: Prisma.TransactionClient, ...days: Row[]): Promise<void> {
    const closed = days.filter((d) => (CLOSED_DAY_TYPES as readonly string[]).includes(d.type));
    if (!closed.length) return;
    const from = closed.map((d) => toDay(d.startsOn)).sort()[0]!;
    const to = closed.map((d) => toDay(d.endsOn)).sort().at(-1)!;
    await this.occupancy.reindexRange(tx, from, to);
  }

  /**
   * The days without classes (holiday, no_classes) that touch [from, to], as audiences in the shared
   * model's notation (`all`, `bac`, `bac-premiere`), for occurrences() and the .ics export.
   */
  async closures(from: string, to: string): Promise<Closure[]> {
    return loadClosures(this.prisma, CLOSED_DAY_TYPES, from, to);
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
