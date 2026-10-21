import { ConflictException, Injectable } from '@nestjs/common';
import type { Period, Prisma, ReportCard } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { ClassesService } from '../classes/classes.service.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { toIso } from '../common/dates.js';
import { forbidden, notFound } from '../common/errors.js';
import { wasTargeted } from '@cdls/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { toEntries } from '../targets/target.mapper.js';
import { computeReportCards, type SubjectWeight, subjectWeights } from './compute.js';
import type {
  ReportCardBatchResultDto,
  ReportCardDto,
  ReportCardSubjectDto,
} from './dto/report-card.dto.js';
import { reportCardPdf } from './report-card.pdf.js';

const SCHOOL_NAME = 'Collège de la Salle — Daher';

const include = { student: { include: { user: true } } } satisfies Prisma.ReportCardInclude;
type CardRow = Prisma.ReportCardGetPayload<{ include: typeof include }>;

/** Period report cards: generated from published grades once the period is closed, then published. */
@Injectable()
export class ReportCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly classes: ClassesService,
  ) {}

  /** (Re)computes the unpublished report cards of a closed period; published ones are left as they are. */
  async generate(
    periodId: string,
    classId: string | undefined,
    user: AuthUser,
  ): Promise<ReportCardBatchResultDto> {
    const period = await this.closedPeriod(periodId);
    let count = 0;
    for (const schoolClass of await this.classesOf(period, classId)) {
      const roster = await this.classes.roster(schoolClass.id);
      const subjects = await this.subjectWeights(schoolClass.id);
      const grades = await this.prisma.grade.findMany({
        where: {
          published: true,
          studentId: { in: roster.map((s) => s.id) },
          // The events' stored period, never their dates: editing a period's dates moves no grade.
          event: { classId: schoolClass.id, periodId },
        },
        include: {
          event: { select: { subjectId: true, coefficient: true, targets: true } },
        },
      });
      // Only graded work the student was targeted for counts (a group's test is not in the others' average).
      const memberships = await this.prisma.groupMember.findMany({
        where: { studentId: { in: roster.map((s) => s.id) }, classId: schoolClass.id },
        select: { studentId: true, groupId: true },
      });
      const groupsOf = new Map<string, Set<string>>();
      for (const m of memberships)
        groupsOf.set(m.studentId, (groupsOf.get(m.studentId) ?? new Set()).add(m.groupId));
      const targeted = grades.filter((g) =>
        wasTargeted(toEntries(g.event.targets), g.studentId, groupsOf.get(g.studentId) ?? new Set()),
      );
      const cards = computeReportCards(
        roster.map((s) => s.id),
        subjects,
        targeted.map((g) => ({
          studentId: g.studentId,
          subjectId: g.event.subjectId ?? '',
          score: Number(g.score),
          outOf: Number(g.outOf),
          coefficient: Number(g.event.coefficient),
        })),
      );
      const published = new Set(
        (
          await this.prisma.reportCard.findMany({
            where: {
              periodId,
              studentId: { in: roster.map((s) => s.id) },
              publishedAt: { not: null },
            },
            select: { studentId: true },
          })
        ).map((c) => c.studentId),
      );
      const writes = cards
        .filter((c) => !published.has(c.studentId))
        .map((c) => {
          const data = {
            classId: schoolClass.id,
            average: c.average,
            rank: c.rank,
            subjects: c.subjects.map((s) => ({ ...s })),
            generatedAt: new Date(),
          };
          return this.prisma.reportCard.upsert({
            where: { studentId_periodId: { studentId: c.studentId, periodId } },
            create: { ...data, studentId: c.studentId, periodId },
            update: data,
          });
        });
      await this.prisma.$transaction(writes);
      count += writes.length;
    }
    await audit(this.prisma, [
      {
        actorId: user.id,
        action: 'report_cards.generate',
        entity: 'period',
        entityId: periodId,
        after: { classId: classId ?? null, count },
      },
    ]);
    return { count };
  }

  async publish(
    periodId: string,
    classId: string | undefined,
    user: AuthUser,
  ): Promise<ReportCardBatchResultDto> {
    await this.closedPeriod(periodId);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.reportCard.updateMany({
        where: { periodId, publishedAt: null, ...(classId ? { classId } : {}) },
        data: { publishedAt: new Date() },
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'report_cards.publish',
          entity: 'period',
          entityId: periodId,
          after: { classId: classId ?? null, count },
        },
      ]);
      return { count };
    });
  }

  /** A period's report cards (admins: all or one class; teachers: a class they teach), by rank. */
  async forPeriod(
    periodId: string,
    classId: string | undefined,
    user: AuthUser,
  ): Promise<ReportCardDto[]> {
    if (user.role !== 'admin') {
      if (!classId) throw forbidden();
      await this.access.assertTeachesClass(user, classId);
    }
    const rows = await this.prisma.reportCard.findMany({
      where: { periodId, ...(classId ? { classId } : {}) },
      include,
      orderBy: [{ classId: 'asc' }, { rank: { sort: 'asc', nulls: 'last' } }],
    });
    return rows.map(toReportCardDto);
  }

  /** A student's report cards. Students: their own, published only. */
  async forStudent(studentId: string, user: AuthUser): Promise<ReportCardDto[]> {
    await this.access.assertCanReadStudent(user, studentId);
    const rows = await this.prisma.reportCard.findMany({
      where: { studentId, ...(user.role === 'student' ? { publishedAt: { not: null } } : {}) },
      include,
      orderBy: { period: { startsOn: 'desc' } },
    });
    return rows.map(toReportCardDto);
  }

  async updateAppreciation(
    id: string,
    appreciation: string,
    user: AuthUser,
  ): Promise<ReportCardDto> {
    const card = await this.readable(id, user);
    if (user.role === 'student') throw forbidden();
    if (card.publishedAt) throw new ConflictException('Bulletin déjà publié.');
    return toReportCardDto(
      await this.prisma.reportCard.update({ where: { id }, data: { appreciation }, include }),
    );
  }

  async pdf(id: string, user: AuthUser): Promise<{ filename: string; content: Buffer }> {
    const card = await this.readable(id, user);
    const [period, schoolClass, classSize] = await Promise.all([
      this.prisma.period.findUniqueOrThrow({
        where: { id: card.periodId },
        include: { schoolYear: true },
      }),
      this.prisma.schoolClass.findUniqueOrThrow({ where: { id: card.classId } }),
      this.prisma.reportCard.count({ where: { periodId: card.periodId, classId: card.classId } }),
    ]);
    const dto = toReportCardDto(card);
    const content = await reportCardPdf(dto, {
      schoolName: SCHOOL_NAME,
      termLabel: period.label,
      yearLabel: period.schoolYear.label,
      classLabel: schoolClass.label,
      classSize,
    });
    const slug = dto.studentName
      .normalize('NFD')
      .replace(/[^\w]+/g, '-')
      .toLowerCase();
    return { filename: `bulletin-${period.number}-${slug}.pdf`, content };
  }

  /** Students: their own published card; teachers: cards of classes they teach; admins: all. */
  private async readable(id: string, user: AuthUser): Promise<CardRow> {
    const card = await this.prisma.reportCard.findUnique({ where: { id }, include });
    if (!card) throw notFound('Bulletin');
    if (user.role === 'student') {
      if (card.studentId !== user.studentId || !card.publishedAt) throw notFound('Bulletin');
    } else {
      await this.access.assertTeachesClass(user, card.classId);
    }
    return card;
  }

  private async closedPeriod(periodId: string): Promise<Period> {
    const period = await this.prisma.period.findUnique({ where: { id: periodId } });
    if (!period) throw notFound('Période');
    if (!period.closedAt) throw new ConflictException('Clôturez la période avant les bulletins.');
    return period;
  }

  /** The classes of the period's school year, limited to its section when it has one. */
  private async classesOf(period: Period, classId: string | undefined) {
    const classes = await this.prisma.schoolClass.findMany({
      where: {
        schoolYearId: period.schoolYearId,
        ...(period.sectionId ? { sectionId: period.sectionId } : {}),
        ...(classId ? { id: classId } : {}),
      },
    });
    if (classId && !classes.length) throw notFound('Classe');
    return classes;
  }

  /** The class's subjects and their coefficients (its class subjects). */
  private async subjectWeights(classId: string): Promise<SubjectWeight[]> {
    const rows = await this.prisma.classSubject.findMany({
      where: { classId },
      include: { subject: true },
      orderBy: { subject: { name: 'asc' } },
    });
    return subjectWeights(rows.map((r) => ({ ...r, coefficient: Number(r.coefficient) })));
  }
}

function toReportCardDto(c: CardRow | (ReportCard & CardRow)): ReportCardDto {
  return {
    id: c.id,
    studentId: c.studentId,
    studentName: `${c.student.user.firstName} ${c.student.user.lastName}`,
    periodId: c.periodId,
    classId: c.classId,
    average: c.average === null ? null : Number(c.average),
    rank: c.rank,
    appreciation: c.appreciation,
    subjects: (c.subjects ?? []) as unknown as ReportCardSubjectDto[],
    generatedAt: c.generatedAt.toISOString(),
    publishedAt: toIso(c.publishedAt),
  };
}
