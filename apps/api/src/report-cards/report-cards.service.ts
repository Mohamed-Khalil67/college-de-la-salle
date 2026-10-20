import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, ReportCard, Term } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { ClassesService } from '../classes/classes.service.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { toIso } from '../common/dates.js';
import { forbidden, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { computeReportCards, type SubjectWeight } from './compute.js';
import type {
  ReportCardBatchResultDto,
  ReportCardDto,
  ReportCardSubjectDto,
} from './dto/report-card.dto.js';
import { reportCardPdf } from './report-card.pdf.js';

const SCHOOL_NAME = 'Collège de la Salle — Daher';

const include = { student: { include: { user: true } } } satisfies Prisma.ReportCardInclude;
type CardRow = Prisma.ReportCardGetPayload<{ include: typeof include }>;

/** Term report cards: generated from published grades once the term is closed, then published. */
@Injectable()
export class ReportCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly classes: ClassesService,
  ) {}

  /** (Re)computes the unpublished report cards of a closed term; published ones are left as they are. */
  async generate(
    termId: string,
    classId: string | undefined,
    user: AuthUser,
  ): Promise<ReportCardBatchResultDto> {
    const term = await this.closedTerm(termId);
    let count = 0;
    for (const schoolClass of await this.classesOf(term, classId)) {
      const roster = await this.classes.roster(schoolClass.id);
      const subjects = await this.subjectWeights(schoolClass.id);
      const grades = await this.prisma.grade.findMany({
        where: {
          published: true,
          studentId: { in: roster.map((s) => s.id) },
          event: { classId: schoolClass.id, date: { gte: term.startsOn, lte: term.endsOn } },
        },
        include: { event: { select: { subjectId: true, coefficient: true } } },
      });
      const cards = computeReportCards(
        roster.map((s) => s.id),
        subjects,
        grades.map((g) => ({
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
              termId,
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
            where: { studentId_termId: { studentId: c.studentId, termId } },
            create: { ...data, studentId: c.studentId, termId },
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
        entity: 'term',
        entityId: termId,
        after: { classId: classId ?? null, count },
      },
    ]);
    return { count };
  }

  async publish(
    termId: string,
    classId: string | undefined,
    user: AuthUser,
  ): Promise<ReportCardBatchResultDto> {
    await this.closedTerm(termId);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.reportCard.updateMany({
        where: { termId, publishedAt: null, ...(classId ? { classId } : {}) },
        data: { publishedAt: new Date() },
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'report_cards.publish',
          entity: 'term',
          entityId: termId,
          after: { classId: classId ?? null, count },
        },
      ]);
      return { count };
    });
  }

  /** A term's report cards (admins: all or one class; teachers: a class they teach), by rank. */
  async forTerm(
    termId: string,
    classId: string | undefined,
    user: AuthUser,
  ): Promise<ReportCardDto[]> {
    if (user.role !== 'admin') {
      if (!classId) throw forbidden();
      await this.access.assertTeachesClass(user, classId);
    }
    const rows = await this.prisma.reportCard.findMany({
      where: { termId, ...(classId ? { classId } : {}) },
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
      orderBy: { term: { startsOn: 'desc' } },
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
    const [term, schoolClass, classSize] = await Promise.all([
      this.prisma.term.findUniqueOrThrow({
        where: { id: card.termId },
        include: { schoolYear: true },
      }),
      this.prisma.schoolClass.findUniqueOrThrow({ where: { id: card.classId } }),
      this.prisma.reportCard.count({ where: { termId: card.termId, classId: card.classId } }),
    ]);
    const dto = toReportCardDto(card);
    const content = await reportCardPdf(dto, {
      schoolName: SCHOOL_NAME,
      termLabel: term.label,
      yearLabel: term.schoolYear.label,
      classLabel: schoolClass.label,
      classSize,
    });
    const slug = dto.studentName
      .normalize('NFD')
      .replace(/[^\w]+/g, '-')
      .toLowerCase();
    return { filename: `bulletin-${term.number}-${slug}.pdf`, content };
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

  private async closedTerm(termId: string): Promise<Term> {
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw notFound('Trimestre');
    if (!term.closedAt) throw new ConflictException('Clôturez le trimestre avant les bulletins.');
    return term;
  }

  private async classesOf(term: Term, classId: string | undefined) {
    const classes = await this.prisma.schoolClass.findMany({
      where: { schoolYearId: term.schoolYearId, ...(classId ? { id: classId } : {}) },
    });
    if (classId && !classes.length) throw notFound('Classe');
    return classes;
  }

  /** The class's subjects and coefficients (the highest when two teachers share a subject). */
  private async subjectWeights(classId: string): Promise<SubjectWeight[]> {
    const rows = await this.prisma.teachingAssignment.findMany({
      where: { classId },
      include: { subject: true },
      orderBy: { subject: { name: 'asc' } },
    });
    const bySubject = new Map<string, SubjectWeight>();
    for (const r of rows) {
      const coefficient = Number(r.coefficient);
      const current = bySubject.get(r.subjectId);
      if (!current || coefficient > current.coefficient) {
        bySubject.set(r.subjectId, {
          subjectId: r.subjectId,
          subjectName: r.subject.name,
          coefficient,
        });
      }
    }
    return [...bySubject.values()];
  }
}

function toReportCardDto(c: CardRow | (ReportCard & CardRow)): ReportCardDto {
  return {
    id: c.id,
    studentId: c.studentId,
    studentName: `${c.student.user.firstName} ${c.student.user.lastName}`,
    termId: c.termId,
    classId: c.classId,
    average: c.average === null ? null : Number(c.average),
    rank: c.rank,
    appreciation: c.appreciation,
    subjects: (c.subjects ?? []) as unknown as ReportCardSubjectDto[],
    generatedAt: c.generatedAt.toISOString(),
    publishedAt: toIso(c.publishedAt),
  };
}
