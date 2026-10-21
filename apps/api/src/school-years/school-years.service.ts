import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Period, Prisma, SchoolYear } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay, toIso } from '../common/dates.js';
import { conflictOnReference, notFound } from '../common/errors.js';
import { toPeriodDto } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateSchoolYearDto,
  SchoolYearDto,
  UpdateSchoolYearDto,
} from './dto/school-year.dto.js';

const withPeriods = {
  periods: { orderBy: [{ startsOn: 'asc' as const }, { number: 'asc' as const }] },
} satisfies Prisma.SchoolYearInclude;

@Injectable()
export class SchoolYearsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SchoolYearDto[]> {
    const years = await this.prisma.schoolYear.findMany({
      include: withPeriods,
      orderBy: { startsOn: 'desc' },
    });
    return years.map(toSchoolYearDto);
  }

  async create(dto: CreateSchoolYearDto, user: AuthUser): Promise<SchoolYearDto> {
    if (dto.endsOn <= dto.startsOn) throw new BadRequestException('La fin doit suivre le début.');
    if (await this.prisma.schoolYear.findUnique({ where: { label: dto.label } })) {
      throw new ConflictException(`L'année ${dto.label} existe déjà.`);
    }
    return this.prisma.$transaction(async (tx) => {
      const year = await tx.schoolYear.create({
        data: { label: dto.label, startsOn: fromDay(dto.startsOn), endsOn: fromDay(dto.endsOn) },
        include: withPeriods,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'school_year.create',
          entity: 'school_year',
          entityId: year.id,
          after: { label: dto.label, startsOn: dto.startsOn, endsOn: dto.endsOn },
        },
      ]);
      return toSchoolYearDto(year);
    });
  }

  /**
   * Renames the year or moves its dates. The new dates must still contain every period and calendar day
   * of the year, so nothing is left outside it.
   */
  async update(id: string, dto: UpdateSchoolYearDto, user: AuthUser): Promise<SchoolYearDto> {
    const current = await this.find(id);
    const startsOn = dto.startsOn ?? toDay(current.startsOn);
    const endsOn = dto.endsOn ?? toDay(current.endsOn);
    if (endsOn <= startsOn) throw new BadRequestException('La fin doit suivre le début.');
    if (dto.label && dto.label !== current.label) {
      if (await this.prisma.schoolYear.findUnique({ where: { label: dto.label } }))
        throw new ConflictException(`L'année ${dto.label} existe déjà.`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM school_years WHERE id = ${id}::uuid FOR UPDATE`;
      const outside = await Promise.all([
        tx.period.count({
          where: {
            schoolYearId: id,
            OR: [{ startsOn: { lt: fromDay(startsOn) } }, { endsOn: { gt: fromDay(endsOn) } }],
          },
        }),
        tx.calendarDay.count({
          where: {
            schoolYearId: id,
            OR: [{ startsOn: { lt: fromDay(startsOn) } }, { endsOn: { gt: fromDay(endsOn) } }],
          },
        }),
      ]);
      if (outside[0] || outside[1])
        throw new ConflictException(
          'Des périodes ou des jours du calendrier sortiraient de l’année : modifiez-les d’abord.',
        );
      const year = await tx.schoolYear.update({
        where: { id },
        data: { label: dto.label, startsOn: fromDay(startsOn), endsOn: fromDay(endsOn) },
        include: withPeriods,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'school_year.update',
          entity: 'school_year',
          entityId: id,
          before: {
            label: current.label,
            startsOn: toDay(current.startsOn),
            endsOn: toDay(current.endsOn),
          },
          after: { label: year.label, startsOn, endsOn },
        },
      ]);
      return toSchoolYearDto(year);
    });
  }

  /** Makes this the current year (exactly one is current). */
  async makeCurrent(id: string, user: AuthUser): Promise<SchoolYearDto> {
    if ((await this.find(id)).archivedAt)
      throw new ConflictException('Cette année est archivée : elle ne peut plus devenir l’année en cours.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM school_years WHERE id = ${id}::uuid FOR UPDATE`;
      if ((await tx.schoolYear.findUniqueOrThrow({ where: { id } })).archivedAt)
        throw new ConflictException('Cette année est archivée : elle ne peut plus devenir l’année en cours.');
      await tx.schoolYear.updateMany({
        where: { isCurrent: true, NOT: { id } },
        data: { isCurrent: false },
      });
      const year = await tx.schoolYear.update({
        where: { id },
        data: { isCurrent: true },
        include: withPeriods,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'school_year.make_current',
          entity: 'school_year',
          entityId: id,
        },
      ]);
      return toSchoolYearDto(year);
    });
  }

  /** Deletes a school year created by mistake: not the current one, and without classes. Its periods go with it. */
  async removeYear(id: string, user: AuthUser): Promise<void> {
    const year = await this.find(id);
    const hasClasses = `L’année ${year.label} a encore des classes : supprimez-les avant de supprimer l’année.`;
    const work = this.prisma.$transaction(async (tx) => {
      // Lock and re-read the year: it may have become the current one meanwhile.
      await tx.$queryRaw`SELECT id FROM school_years WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.schoolYear.findUnique({ where: { id } });
      if (!current) throw notFound('Année scolaire');
      if (current.isCurrent)
        throw new ConflictException(
          'L’année en cours ne peut pas être supprimée : définissez d’abord une autre année en cours.',
        );
      if (await tx.schoolClass.count({ where: { schoolYearId: id } }))
        throw new ConflictException(hasClasses);
      await tx.schoolYear.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'school_year.delete',
          entity: 'school_year',
          entityId: id,
          before: { label: year.label, startsOn: toDay(year.startsOn), endsOn: toDay(year.endsOn) },
        },
      ]);
    });
    // A class created between the check and the delete (restrict foreign key).
    await conflictOnReference(work, hasClasses);
  }

  private async find(id: string): Promise<SchoolYear> {
    const year = await this.prisma.schoolYear.findUnique({ where: { id } });
    if (!year) throw notFound('Année scolaire');
    return year;
  }
}

function toSchoolYearDto(y: SchoolYear & { periods: Period[] }): SchoolYearDto {
  return {
    id: y.id,
    label: y.label,
    startsOn: toDay(y.startsOn),
    endsOn: toDay(y.endsOn),
    isCurrent: y.isCurrent,
    status: y.archivedAt ? 'archived' : y.isCurrent ? 'current' : 'upcoming',
    archivedAt: toIso(y.archivedAt),
    periods: y.periods.map(toPeriodDto),
  };
}
