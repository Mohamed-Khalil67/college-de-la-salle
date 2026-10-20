import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { SchoolYear, Term } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay, toIso } from '../common/dates.js';
import { conflictOnReference, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateSchoolYearDto,
  CreateTermDto,
  SchoolYearDto,
  TermDto,
} from './dto/school-year.dto.js';

@Injectable()
export class SchoolYearsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SchoolYearDto[]> {
    const years = await this.prisma.schoolYear.findMany({
      include: { terms: { orderBy: { number: 'asc' } } },
      orderBy: { startsOn: 'desc' },
    });
    return years.map(toSchoolYearDto);
  }

  async create(dto: CreateSchoolYearDto): Promise<SchoolYearDto> {
    if (dto.endsOn <= dto.startsOn) throw new BadRequestException('La fin doit suivre le début.');
    if (await this.prisma.schoolYear.findUnique({ where: { label: dto.label } })) {
      throw new ConflictException(`L'année ${dto.label} existe déjà.`);
    }
    const year = await this.prisma.schoolYear.create({
      data: { label: dto.label, startsOn: fromDay(dto.startsOn), endsOn: fromDay(dto.endsOn) },
      include: { terms: true },
    });
    return toSchoolYearDto(year);
  }

  /** Makes this the current year (exactly one is current). */
  async makeCurrent(id: string): Promise<SchoolYearDto> {
    await this.find(id);
    const [, year] = await this.prisma.$transaction([
      this.prisma.schoolYear.updateMany({
        where: { isCurrent: true, NOT: { id } },
        data: { isCurrent: false },
      }),
      this.prisma.schoolYear.update({
        where: { id },
        data: { isCurrent: true },
        include: { terms: { orderBy: { number: 'asc' } } },
      }),
    ]);
    return toSchoolYearDto(year);
  }

  async addTerm(schoolYearId: string, dto: CreateTermDto): Promise<TermDto> {
    const year = await this.find(schoolYearId);
    if (dto.endsOn <= dto.startsOn) throw new BadRequestException('La fin doit suivre le début.');
    if (dto.startsOn < toDay(year.startsOn) || dto.endsOn > toDay(year.endsOn)) {
      throw new BadRequestException(`Le trimestre doit être compris dans l'année ${year.label}.`);
    }
    const exists = await this.prisma.term.findUnique({
      where: { schoolYearId_number: { schoolYearId, number: dto.number } },
    });
    if (exists) throw new ConflictException(`Le trimestre ${dto.number} existe déjà.`);
    const term = await this.prisma.term.create({
      data: {
        schoolYearId,
        number: dto.number,
        label: dto.label,
        startsOn: fromDay(dto.startsOn),
        endsOn: fromDay(dto.endsOn),
      },
    });
    return toTermDto(term);
  }

  /** Closes (or reopens) a term. Report cards are generated and published for closed terms. */
  async closeTerm(id: string, closed: boolean): Promise<TermDto> {
    const term = await this.prisma.term.findUnique({ where: { id } });
    if (!term) throw notFound('Trimestre');
    const updated = await this.prisma.term.update({
      where: { id },
      data: { closedAt: closed ? new Date() : null },
    });
    return toTermDto(updated);
  }

  /** Deletes a school year created by mistake: not the current one, and without classes. Its terms go with it. */
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

  /** Deletes a term without grades or report cards (grades of its year's classes dated in the term). */
  async removeTerm(id: string, user: AuthUser): Promise<void> {
    const hasReportCards = 'Ce trimestre a des bulletins : il ne peut pas être supprimé.';
    const work = this.prisma.$transaction(async (tx) => {
      const term = await tx.term.findUnique({ where: { id } });
      if (!term) throw notFound('Trimestre');
      const [reportCards, grades] = await Promise.all([
        tx.reportCard.count({ where: { termId: id } }),
        tx.grade.count({
          where: {
            event: {
              date: { gte: term.startsOn, lte: term.endsOn },
              schoolClass: { schoolYearId: term.schoolYearId },
            },
          },
        }),
      ]);
      if (reportCards) throw new ConflictException(hasReportCards);
      if (grades)
        throw new ConflictException(
          'Des notes ont déjà été saisies pendant ce trimestre : il ne peut pas être supprimé.',
        );
      await tx.term.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'term.delete',
          entity: 'term',
          entityId: id,
          before: { schoolYearId: term.schoolYearId, number: term.number, label: term.label },
        },
      ]);
    });
    // Report cards generated between the check and the delete (restrict foreign key).
    await conflictOnReference(work, hasReportCards);
  }

  private async find(id: string): Promise<SchoolYear> {
    const year = await this.prisma.schoolYear.findUnique({ where: { id } });
    if (!year) throw notFound('Année scolaire');
    return year;
  }
}

export function toTermDto(t: Term): TermDto {
  return {
    id: t.id,
    schoolYearId: t.schoolYearId,
    number: t.number,
    label: t.label,
    startsOn: toDay(t.startsOn),
    endsOn: toDay(t.endsOn),
    closedAt: toIso(t.closedAt),
  };
}

function toSchoolYearDto(y: SchoolYear & { terms: Term[] }): SchoolYearDto {
  return {
    id: y.id,
    label: y.label,
    startsOn: toDay(y.startsOn),
    endsOn: toDay(y.endsOn),
    isCurrent: y.isCurrent,
    terms: y.terms.map(toTermDto),
  };
}
