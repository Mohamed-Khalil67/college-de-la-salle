import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { PeriodKind } from '@cdls/shared';
import type { Period, Prisma } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay, toIso } from '../common/dates.js';
import { conflictOnReference, isExclusionViolation, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePeriodDto, PeriodDto, UpdatePeriodDto } from './dto/period.dto.js';

const OVERLAP =
  'Cette période chevauche une autre période du même type pour cette section : ajustez les dates.';
const CLOSED = 'Cette période est clôturée : elle ne peut plus être modifiée.';
const HAS_CARDS = 'Cette période a des bulletins : elle ne peut pas être supprimée.';

type Db = PrismaService | Prisma.TransactionClient;

interface Fields {
  readonly kind: PeriodKind;
  readonly sectionId: string | null;
  readonly number: number;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

/**
 * Periods (trimesters or semesters) of a school year, for every section or one section. Editing a period's
 * dates never moves grades, which follow `Event.periodId`; a closed period is locked.
 */
@Injectable()
export class PeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(schoolYearId: string, dto: CreatePeriodDto, user: AuthUser): Promise<PeriodDto> {
    const year = await this.prisma.schoolYear.findUnique({ where: { id: schoolYearId } });
    if (!year) throw notFound('Année scolaire');
    const fields: Fields = {
      kind: dto.kind ?? 'trimester',
      sectionId: dto.sectionId ?? null,
      number: dto.number,
      label: dto.label,
      startsOn: dto.startsOn,
      endsOn: dto.endsOn,
    };
    await this.check(year, fields);
    return this.write(schoolYearId, null, fields, async (tx) => {
      const row = await tx.period.create({ data: { schoolYearId, ...toData(fields) } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'period.create',
          entity: 'period',
          entityId: row.id,
          after: snapshot(row),
        },
      ]);
      return row;
    });
  }

  /** Changes a period that is not closed. 409 if the new dates overlap another period of the same kind and section. */
  async update(id: string, dto: UpdatePeriodDto, user: AuthUser): Promise<PeriodDto> {
    const current = await this.find(id);
    if (current.closedAt) throw new ConflictException(CLOSED);
    const year = await this.prisma.schoolYear.findUniqueOrThrow({
      where: { id: current.schoolYearId },
    });
    const fields: Fields = {
      kind: dto.kind ?? current.kind,
      sectionId: dto.sectionId === undefined ? current.sectionId : dto.sectionId,
      number: dto.number ?? current.number,
      label: dto.label ?? current.label,
      startsOn: dto.startsOn ?? toDay(current.startsOn),
      endsOn: dto.endsOn ?? toDay(current.endsOn),
    };
    await this.check(year, fields);
    if (
      (fields.kind !== current.kind || fields.sectionId !== current.sectionId) &&
      (await this.prisma.event.count({ where: { periodId: id } }))
    )
      throw new ConflictException(
        'Des événements notés sont rattachés à cette période : son type et sa section ne peuvent plus changer.',
      );
    return this.write(current.schoolYearId, id, fields, async (tx) => {
      // Re-read under the lock: it may have been closed meanwhile.
      const locked = await tx.period.findUnique({ where: { id } });
      if (!locked) throw notFound('Période');
      if (locked.closedAt) throw new ConflictException(CLOSED);
      const row = await tx.period.update({ where: { id }, data: toData(fields) });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'period.update',
          entity: 'period',
          entityId: id,
          before: snapshot(current),
          after: snapshot(row),
        },
      ]);
      return row;
    });
  }

  /** Closes a period (locks it, then report cards can be generated) or reopens it. */
  async close(id: string, closed: boolean, user: AuthUser): Promise<PeriodDto> {
    const current = await this.find(id);
    if (closed === !!current.closedAt) return toPeriodDto(current);
    if (
      !closed &&
      (await this.prisma.reportCard.count({ where: { periodId: id, publishedAt: { not: null } } }))
    )
      throw new ConflictException(
        'Des bulletins publiés existent : la période ne peut plus être rouverte.',
      );
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.period.update({
        where: { id },
        data: { closedAt: closed ? new Date() : null },
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: closed ? 'period.close' : 'period.reopen',
          entity: 'period',
          entityId: id,
        },
      ]);
      return toPeriodDto(row);
    });
  }

  /** Deletes a period without report cards or grades. */
  async remove(id: string, user: AuthUser): Promise<void> {
    const work = this.prisma.$transaction(async (tx) => {
      const period = await tx.period.findUnique({ where: { id } });
      if (!period) throw notFound('Période');
      if (await tx.reportCard.count({ where: { periodId: id } }))
        throw new ConflictException(HAS_CARDS);
      if (await tx.grade.count({ where: { event: { periodId: id } } }))
        throw new ConflictException(
          'Des notes sont rattachées à cette période : elle ne peut pas être supprimée.',
        );
      if (period.closedAt) throw new ConflictException(CLOSED);
      // Events without grades simply lose their period.
      await tx.event.updateMany({ where: { periodId: id }, data: { periodId: null } });
      await tx.period.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'period.delete',
          entity: 'period',
          entityId: id,
          before: snapshot(period),
        },
      ]);
    });
    await conflictOnReference(work, HAS_CARDS);
  }

  async find(id: string): Promise<Period> {
    const row = await this.prisma.period.findUnique({ where: { id } });
    if (!row) throw notFound('Période');
    return row;
  }

  /**
   * The period a gradable event of this class counts for: `explicitId` (same school year, every section or
   * the class's), else the period containing `date`, preferring the class's section over « every section »
   * and trimesters over semesters. 400 when none fits; 409 when the period is closed.
   */
  async resolveFor(
    db: Db,
    classId: string,
    date: string,
    explicitId: string | null | undefined,
  ): Promise<Period> {
    const schoolClass = await db.schoolClass.findUnique({ where: { id: classId } });
    if (!schoolClass) throw notFound('Classe');
    const forClass: Prisma.PeriodWhereInput = {
      schoolYearId: schoolClass.schoolYearId,
      OR: [{ sectionId: null }, { sectionId: schoolClass.sectionId }],
    };
    let period: Period | null;
    if (explicitId) {
      period = await db.period.findFirst({ where: { id: explicitId, ...forClass } });
      if (!period) throw new BadRequestException('Cette période ne correspond pas à la classe.');
    } else {
      const candidates = await db.period.findMany({
        where: { ...forClass, startsOn: { lte: fromDay(date) }, endsOn: { gte: fromDay(date) } },
      });
      period =
        candidates.sort(
          (a, b) =>
            Number(b.sectionId !== null) - Number(a.sectionId !== null) ||
            Number(b.kind === 'trimester') - Number(a.kind === 'trimester'),
        )[0] ?? null;
      if (!period)
        throw new BadRequestException(
          'Aucune période ne couvre cette date : créez la période de l’année ou choisissez-en une.',
        );
    }
    if (period.closedAt) throw new ConflictException(CLOSED);
    return period;
  }

  /** 409 when the period is closed (its grades are locked). */
  async assertOpen(db: Db, periodId: string | null): Promise<void> {
    if (!periodId) return;
    const period = await db.period.findUnique({
      where: { id: periodId },
      select: { closedAt: true },
    });
    if (period?.closedAt)
      throw new ConflictException('La période est clôturée : les notes ne peuvent plus changer.');
  }

  /** Dates, and the period's place inside its school year. */
  private async check(
    year: { label: string; startsOn: Date; endsOn: Date },
    f: Fields,
  ): Promise<void> {
    if (f.endsOn <= f.startsOn) throw new BadRequestException('La fin doit suivre le début.');
    if (f.startsOn < toDay(year.startsOn) || f.endsOn > toDay(year.endsOn))
      throw new BadRequestException(`La période doit être comprise dans l’année ${year.label}.`);
    if (f.sectionId && !(await this.prisma.section.findUnique({ where: { id: f.sectionId } })))
      throw notFound('Section');
  }

  /**
   * Runs the write under a per-year advisory lock after checking overlaps, which also compares an
   * « every section » period with a section's (the database constraint only compares equal sections).
   * The EXCLUDE constraints stay the last word and answer the same 409.
   */
  private async write(
    schoolYearId: string,
    selfId: string | null,
    f: Fields,
    work: (tx: Prisma.TransactionClient) => Promise<Period>,
  ): Promise<PeriodDto> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`periods:${schoolYearId}`}, 0))`;
        const overlapping = await tx.period.count({
          where: {
            schoolYearId,
            kind: f.kind,
            ...(selfId ? { NOT: { id: selfId } } : {}),
            ...(f.sectionId ? { OR: [{ sectionId: null }, { sectionId: f.sectionId }] } : {}),
            startsOn: { lte: fromDay(f.endsOn) },
            endsOn: { gte: fromDay(f.startsOn) },
          },
        });
        if (overlapping) throw new ConflictException(OVERLAP);
        return work(tx);
      });
      return toPeriodDto(row);
    } catch (error) {
      if (isExclusionViolation(error, 'periods_no_overlap')) throw new ConflictException(OVERLAP);
      if (isExclusionViolation(error, 'periods_number_unique'))
        throw new ConflictException(`La période n° ${f.number} existe déjà pour cette section.`);
      throw error;
    }
  }
}

function toData(f: Fields) {
  return {
    kind: f.kind,
    sectionId: f.sectionId,
    number: f.number,
    label: f.label,
    startsOn: fromDay(f.startsOn),
    endsOn: fromDay(f.endsOn),
  };
}

function snapshot(p: Period) {
  return {
    kind: p.kind,
    sectionId: p.sectionId,
    number: p.number,
    label: p.label,
    startsOn: toDay(p.startsOn),
    endsOn: toDay(p.endsOn),
  };
}

export function toPeriodDto(p: Period): PeriodDto {
  return {
    id: p.id,
    schoolYearId: p.schoolYearId,
    kind: p.kind,
    sectionId: p.sectionId,
    number: p.number,
    label: p.label,
    startsOn: toDay(p.startsOn),
    endsOn: toDay(p.endsOn),
    closedAt: toIso(p.closedAt),
  };
}
