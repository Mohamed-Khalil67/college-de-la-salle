import { ConflictException, Injectable } from '@nestjs/common';
import type { Period, Prisma, ReportCard } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { toDay, toIso } from '../common/dates.js';
import { forbidden, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type ClassStint,
  computeCards,
  type PeriodGrade,
  primaryClassId,
  type SubjectWeight,
  subjectsOfStudent,
  subjectWeights,
} from './compute.js';
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
  ) {}

  /** (Re)computes the unpublished report cards of a closed period; published ones are left as they are. */
  async generate(
    periodId: string,
    classId: string | undefined,
    user: AuthUser,
  ): Promise<ReportCardBatchResultDto> {
    const period = await this.closedPeriod(periodId);
    const inScope = new Set((await this.classesOf(period, classId)).map((c) => c.id));

    // Who was enrolled during the period, and in which classes: a student who changed class or section
    // inside the period has two enrolments, and their card belongs to the class they ended it in.
    const overlapping = {
      schoolYearId: period.schoolYearId,
      enrolledOn: { lte: period.endsOn },
      OR: [{ leftOn: null }, { leftOn: { gte: period.startsOn } }],
    };
    // Only the students of the classes asked for (and all their classes of the period), not the whole school.
    const scoped = await this.prisma.enrollment.findMany({
      where: { ...overlapping, classId: { in: [...inScope] } },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    const enrolments = await this.prisma.enrollment.findMany({
      where: { ...overlapping, studentId: { in: scoped.map((e) => e.studentId) } },
      select: { studentId: true, classId: true, enrolledOn: true, leftOn: true },
    });
    const classIds = [...new Set(enrolments.map((e) => e.classId))];
    const subjectsByClass = await this.subjectWeightsByClass(classIds);
    const byStudent = new Map<string, ClassStint[]>();
    for (const e of enrolments) {
      byStudent.set(e.studentId, [
        ...(byStudent.get(e.studentId) ?? []),
        {
          classId: e.classId,
          enrolledOn: toDay(e.enrolledOn),
          leftOn: e.leftOn ? toDay(e.leftOn) : null,
          subjects: subjectsByClass.get(e.classId) ?? [],
        },
      ]);
    }
    const primary = new Map(
      [...byStudent].map(([studentId, stints]) => [studentId, primaryClassId(stints)!]),
    );
    // Students enrolled until the end of the period (still enrolled, or leaving when the year ends, as the
    // graduates do): a student who left in the middle of the period gets no card. Earlier classes of the
    // period still count for the ones who moved.
    const endsOn = toDay(period.endsOn);
    const cardStudents = [...byStudent]
      .filter(
        ([id, stints]) =>
          inScope.has(primary.get(id)!) &&
          stints.some((st) => st.classId === primary.get(id) && ((st.leftOn ?? null) === null || (st.leftOn ?? "") >= endsOn)),
      )
      .map(([id]) => id);

    // The grades: the events of the period in the class of the card (by the events' stored period, never their
    // dates), and the earlier class's events of the same stretch of the year (another section keeps its own
    // periods, so those are told apart by date).
    const grades = await this.prisma.grade.findMany({
      where: {
        published: true,
        studentId: { in: cardStudents },
        event: {
          classId: { in: classIds },
          OR: [
            { periodId },
            { date: { gte: period.startsOn, lte: period.endsOn } },
          ],
        },
      },
      include: {
        event: { select: { subjectId: true, coefficient: true, classId: true, periodId: true, date: true } },
      },
    });
    const periodGrades: PeriodGrade[] = grades
      .filter((g) => {
        // Only classes the student was enrolled in during the period.
        if (!byStudent.get(g.studentId)?.some((st) => st.classId === g.event.classId)) return false;
        const own = g.event.classId === primary.get(g.studentId);
        return own ? g.event.periodId === periodId : true;
      })
      .map((g) => ({
        studentId: g.studentId,
        subjectId: g.event.subjectId ?? '',
        score: Number(g.score),
        outOf: Number(g.outOf),
        coefficient: Number(g.event.coefficient),
        classId: g.event.classId ?? undefined,
      }));

    const published = new Set(
      (
        await this.prisma.reportCard.findMany({
          where: { periodId, studentId: { in: cardStudents }, publishedAt: { not: null } },
          select: { studentId: true },
        })
      ).map((c) => c.studentId),
    );
    const gradesOf = new Map<string, PeriodGrade[]>();
    for (const g of periodGrades) gradesOf.set(g.studentId, [...(gradesOf.get(g.studentId) ?? []), g]);
    let count = 0;
    // Ranks are per class: the students whose card belongs to the same class.
    for (const cid of inScope) {
      const students = cardStudents.filter((id) => primary.get(id) === cid);
      if (!students.length) continue;
      const cards = computeCards(
        students.map((studentId) => ({
          studentId,
          subjects: subjectsOfStudent(byStudent.get(studentId)!, gradesOf.get(studentId) ?? []),
        })),
        periodGrades,
      );
      const writes = cards
        .filter((c) => !published.has(c.studentId))
        .map((c) => {
          const data = {
            classId: cid,
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

  /** The subjects and coefficients of each class (its class subjects), by subject name. */
  private async subjectWeightsByClass(classIds: readonly string[]): Promise<Map<string, SubjectWeight[]>> {
    const rows = await this.prisma.classSubject.findMany({
      where: { classId: { in: [...classIds] } },
      include: { subject: true },
      orderBy: { subject: { name: 'asc' } },
    });
    const out = new Map<string, SubjectWeight[]>();
    for (const r of rows)
      out.set(r.classId, [
        ...(out.get(r.classId) ?? []),
        ...subjectWeights([{ ...r, coefficient: Number(r.coefficient) }]),
      ]);
    return out;
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
