import { BadRequestException, Injectable } from '@nestjs/common';
import { averageOnTwenty, wasTargeted } from '@cdls/shared';
import type { Grade, Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { toActivityTypeSummary } from '../activity-types/activity-types.service.js';
import { ClassesService } from '../classes/classes.service.js';
import { audit, type AuditEntry } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { eventInclude, type EventRow, toEventDto } from '../events/event.mapper.js';
import { toStudentSummary } from '../classes/classes.service.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type ClassStint, subjectsOfStudent, subjectWeights } from '../report-cards/compute.js';
import { assertClassWritable } from '../school-years/year-guard.js';
import { toEntries } from '../targets/target.mapper.js';
import { TargetsService } from '../targets/targets.service.js';
import type {
  GradeDto,
  GradeSheetDto,
  PublishGradesDto,
  SaveGradesDto,
  StudentGradesDto,
  StudentGradesQueryDto,
} from './dto/grade.dto.js';

/**
 * Grades are entered per gradable event (an activity type with the gradable flag) by a teacher of that class and
 * subject, stay drafts until published, and every change is written to the audit log.
 */
@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly classes: ClassesService,
    private readonly periods: PeriodsService,
    private readonly targets: TargetsService,
  ) {}

  /**
   * The students the work concerns (the whole class by default) with each one's grade, for the entry
   * grid. A student who was graded and is no longer concerned (left the group) stays in the list, marked
   * `targeted: false`: their grade is kept, never dropped silently.
   */
  async sheet(eventId: string, user: AuthUser): Promise<GradeSheetDto> {
    const event = await this.gradableEvent(eventId, user);
    const [{ students }, grades] = await Promise.all([
      this.targets.concerned(this.prisma, event),
      this.prisma.grade.findMany({ where: { eventId } }),
    ]);
    const concerned = new Set(students.map((s) => s.id));
    const former = grades.filter((g) => !concerned.has(g.studentId));
    const formerStudents = former.length
      ? (
          await this.prisma.student.findMany({
            where: { id: { in: former.map((g) => g.studentId) } },
            include: { user: true },
          })
        ).map(toStudentSummary)
      : [];
    const byStudent = new Map(grades.map((g) => [g.studentId, toGradeDto(g)]));
    const rows = [
      ...students.map((student) => ({ student, targeted: true })),
      ...formerStudents.map((student) => ({ student, targeted: false })),
    ]
      .sort(
        (a, b) =>
          a.student.lastName.localeCompare(b.student.lastName, 'fr') ||
          a.student.firstName.localeCompare(b.student.firstName, 'fr'),
      )
      .map((r) => ({ ...r, grade: byStudent.get(r.student.id) ?? null }));
    const [dto] = await this.targets.annotate([toEventDto(event)], user);
    return { event: dto!, rows };
  }

  /** Creates, corrects or removes (score null) grades; one audit row per change. */
  async save(eventId: string, dto: SaveGradesDto, user: AuthUser): Promise<GradeSheetDto> {
    const event = await this.gradableEvent(eventId, user);
    await assertClassWritable(this.prisma, event.classId);
    await this.periods.assertOpen(this.prisma, event.periodId);
    const rosterRows = await this.classes.roster(event.classId!);
    const roster = new Set(rosterRows.map((s) => s.id));
    const nameOf = (id: string) => {
      const s = rosterRows.find((r) => r.id === id);
      return s ? `${s.firstName} ${s.lastName}` : id;
    };
    const seen = new Set<string>();
    for (const entry of dto.entries) {
      if (!roster.has(entry.studentId))
        throw new BadRequestException(`L'élève ${entry.studentId} n'est pas dans cette classe.`);
      if (seen.has(entry.studentId))
        throw new BadRequestException(`L'élève ${entry.studentId} apparaît deux fois.`);
      seen.add(entry.studentId);
    }
    const graderId = user.teacherId ?? event.authorId;

    await this.prisma.$transaction(async (tx) => {
      await assertClassWritable(tx, event.classId);
      await this.periods.lockOpen(tx, event.periodId);
      // The event row is locked: a change of « Assigner à » saved at the same moment waits for this save
      // (or the other way round), so a grade never lands on a student the work no longer concerns.
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
      const concerned = new Set(await this.targets.concernedIds(tx, event));
      for (const entry of dto.entries) {
        if (entry.score !== null && entry.score !== undefined && !concerned.has(entry.studentId))
          throw new BadRequestException(
            `${nameOf(entry.studentId)} n’est pas concerné(e) par cette évaluation. Modifiez d’abord l’assignation (« Assigner à »).`,
          );
      }
      const existing = await tx.grade.findMany({ where: { eventId } });
      const byStudent = new Map(existing.map((g) => [g.studentId, g]));
      const outOf = dto.outOf ?? (existing[0] ? Number(existing[0].outOf) : 20);
      // A late grade follows the event's state: visible if the others were published.
      const published = existing.some((g) => g.published);
      const trail: AuditEntry[] = [];

      for (const entry of dto.entries) {
        const before = byStudent.get(entry.studentId);
        if (entry.score === null || entry.score === undefined) {
          if (!before) continue;
          await tx.grade.delete({ where: { id: before.id } });
          trail.push({
            actorId: user.id,
            action: 'grade.delete',
            entity: 'grade',
            entityId: before.id,
            before: snapshot(before),
          });
          continue;
        }
        if (entry.score > outOf)
          throw new BadRequestException(`Note supérieure au barème (${outOf}).`);
        const data = {
          score: entry.score,
          outOf,
          comment: entry.comment ?? before?.comment ?? '',
          gradedById: graderId,
        };
        if (before) {
          if (
            Number(before.score) === entry.score &&
            Number(before.outOf) === outOf &&
            before.comment === data.comment
          )
            continue;
          const after = await tx.grade.update({ where: { id: before.id }, data });
          trail.push({
            actorId: user.id,
            action: 'grade.update',
            entity: 'grade',
            entityId: after.id,
            before: snapshot(before),
            after: snapshot(after),
          });
        } else {
          const after = await tx.grade.create({
            data: { ...data, eventId, studentId: entry.studentId, published },
          });
          trail.push({
            actorId: user.id,
            action: 'grade.create',
            entity: 'grade',
            entityId: after.id,
            after: snapshot(after),
          });
        }
      }
      // Changing the scale applies to the whole event.
      if (dto.outOf !== undefined)
        await tx.grade.updateMany({
          where: { eventId, outOf: { not: dto.outOf } },
          data: { outOf: dto.outOf },
        });
      await audit(tx, trail);
    });
    return this.sheet(eventId, user);
  }

  /** Shows (or hides again) all the grades of an event to the students. */
  async publish(eventId: string, dto: PublishGradesDto, user: AuthUser): Promise<GradeSheetDto> {
    const event = await this.gradableEvent(eventId, user);
    await assertClassWritable(this.prisma, event.classId);
    await this.periods.assertOpen(this.prisma, event.periodId);
    await this.prisma.$transaction(async (tx) => {
      await assertClassWritable(tx, event.classId);
      await this.periods.lockOpen(tx, event.periodId);
      const { count } = await tx.grade.updateMany({
        where: { eventId },
        data: { published: dto.published },
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: dto.published ? 'grades.publish' : 'grades.unpublish',
          entity: 'event',
          entityId: eventId,
          after: { count },
        },
      ]);
    });
    return this.sheet(eventId, user);
  }

  /**
   * A student's grades by subject with weighted averages (shared averageOnTwenty).
   * Students see their own published grades; teachers the subjects they teach the student; admins all.
   */
  async forStudent(
    studentId: string,
    query: StudentGradesQueryDto,
    user: AuthUser,
  ): Promise<StudentGradesDto> {
    await this.access.assertCanReadStudent(user, studentId);
    if (!(await this.prisma.student.findUnique({ where: { id: studentId } })))
      throw notFound('Élève');

    const eventWhere: Prisma.EventWhereInput = {};
    let schoolYearId: string | null = null;
    let window: { from: Date; to: Date } | null = null;
    if (query.periodId) {
      // By the events' stored period, never by dates: editing a period's dates moves no grade.
      const period = await this.prisma.period.findUnique({ where: { id: query.periodId } });
      if (!period) throw notFound('Période');
      schoolYearId = period.schoolYearId;
      window = { from: period.startsOn, to: period.endsOn };
      // A student who changed class or section inside the period keeps the grades of the earlier class:
      // another section has its own periods, so those events are told apart by date.
      const stints = await this.stintsOf(studentId, schoolYearId, window);
      // The class the student ended the period in counts by its events' stored period (as the report card does);
      // only the earlier classes are told apart by date.
      const ended = stints.at(-1)?.classId;
      const earlier = [...new Set(stints.map((e) => e.classId))].filter((id) => id !== ended);
      eventWhere.OR = [
        { periodId: period.id },
        ...(earlier.length
          ? [{ classId: { in: earlier }, date: { gte: period.startsOn, lte: period.endsOn } }]
          : []),
      ];
    } else if (query.from || query.to) {
      eventWhere.date = {
        ...(query.from ? { gte: fromDay(query.from) } : {}),
        ...(query.to ? { lte: fromDay(query.to) } : {}),
      };
    }
    if (user.role === 'teacher') {
      const placement = await this.access.placement(studentId);
      eventWhere.subjectId = {
        in: placement ? await this.access.subjectsTaught(user.teacherId!, placement.classId) : [],
      };
    }
    const allGrades = await this.prisma.grade.findMany({
      where: {
        studentId,
        ...(user.role === 'student' ? { published: true } : {}),
        event: eventWhere,
      },
      include: { event: { include: { activityType: true, targets: true } } },
      orderBy: { event: { date: 'desc' } },
    });
    // Only the work the student was targeted for counts (a student who moved to another group of the same
    // division keeps the marks earned in the first one).
    const groupsEver = new Set(
      (
        await this.prisma.groupMember.findMany({ where: { studentId }, select: { groupId: true } })
      ).map((m) => m.groupId),
    );
    const grades = allGrades.filter((g) =>
      wasTargeted(toEntries(g.event.targets), studentId, groupsEver),
    );

    const bySubject = new Map<string, typeof grades>();
    for (const g of grades) {
      const key = g.event.subjectId ?? '';
      bySubject.set(key, [...(bySubject.get(key) ?? []), g]);
    }
    const coefficients = await this.subjectCoefficients(studentId, schoolYearId, window, grades);
    return {
      studentId,
      subjects: [...bySubject]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([subjectId, list]) => ({
          subjectId,
          coefficient: coefficients.get(subjectId) ?? null,
          average: averageOnTwenty(
            list.map((g) => ({
              score: Number(g.score),
              outOf: Number(g.outOf),
              coefficient: Number(g.event.coefficient),
            })),
          ),
          grades: list.map((g) => ({
            grade: toGradeDto(g),
            event: {
              id: g.event.id,
              type: toActivityTypeSummary(g.event.activityType),
              title: g.event.title,
              date: toDay(g.event.date),
              subjectId: g.event.subjectId,
              coefficient: Number(g.event.coefficient),
              periodId: g.event.periodId,
            },
          })),
        })),
    };
  }

  /** The student's enrolments of a school year that overlap a period's dates (oldest first). */
  private stintsOf(studentId: string, schoolYearId: string, window: { from: Date; to: Date }) {
    return this.prisma.enrollment.findMany({
      where: {
        studentId,
        schoolYearId,
        enrolledOn: { lte: window.to },
        OR: [{ leftOn: null }, { leftOn: { gte: window.from } }],
      },
      orderBy: [{ enrolledOn: 'asc' }, { leftOn: { sort: 'asc', nulls: 'last' } }],
      select: { classId: true, enrolledOn: true, leftOn: true },
    });
  }

  /**
   * Subject coefficients as the report card weighs them: the class the student was in during the term (the
   * current class without a term). A student who changed class or section inside the term gets the
   * blend described at `subjectsOfStudent` (the coefficient of the class each grade belongs to).
   */
  private async subjectCoefficients(
    studentId: string,
    schoolYearId: string | null,
    window: { from: Date; to: Date } | null,
    grades: readonly {
      score: unknown;
      outOf: unknown;
      event: { subjectId: string | null; coefficient: unknown; classId: string | null };
    }[],
  ): Promise<Map<string, number>> {
    const enrolments =
      schoolYearId && window
        ? await this.stintsOf(studentId, schoolYearId, window)
        : await this.currentStint(studentId);
    if (!enrolments.length) return new Map();
    const classIds = [...new Set(enrolments.map((e) => e.classId))];
    const rows = await this.prisma.classSubject.findMany({
      where: { classId: { in: classIds } },
      include: { subject: true },
    });
    const stints: ClassStint[] = enrolments.map((e) => ({
      classId: e.classId,
      enrolledOn: toDay(e.enrolledOn),
      leftOn: e.leftOn ? toDay(e.leftOn) : null,
      subjects: subjectWeights(
        rows
          .filter((r) => r.classId === e.classId)
          .map((r) => ({ ...r, coefficient: Number(r.coefficient) })),
      ),
    }));
    const weights = subjectsOfStudent(
      stints,
      grades.map((g) => ({
        studentId,
        subjectId: g.event.subjectId ?? '',
        score: Number(g.score),
        outOf: Number(g.outOf),
        coefficient: Number(g.event.coefficient),
        classId: g.event.classId ?? undefined,
      })),
    );
    return new Map(weights.map((w) => [w.subjectId, w.coefficient]));
  }

  private async currentStint(studentId: string) {
    const placement = await this.access.placement(studentId);
    return placement
      ? [{ classId: placement.classId, enrolledOn: new Date(0), leftOn: null as Date | null }]
      : [];
  }

  /** A gradable class event that this user may grade (a teacher of that class and subject, or an admin). */
  private async gradableEvent(eventId: string, user: AuthUser): Promise<EventRow> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventInclude,
    });
    if (!event) throw notFound('Événement');
    if (!event.activityType.gradable || !event.classId)
      throw new BadRequestException('Cet événement ne se note pas.');
    await this.access.assertTeachesClass(user, event.classId, event.subjectId);
    return event;
  }
}

function snapshot(g: Grade): Prisma.InputJsonValue {
  return {
    eventId: g.eventId,
    studentId: g.studentId,
    score: Number(g.score),
    outOf: Number(g.outOf),
    comment: g.comment,
    published: g.published,
  };
}

export function toGradeDto(g: Grade): GradeDto {
  return {
    id: g.id,
    eventId: g.eventId,
    studentId: g.studentId,
    score: Number(g.score),
    outOf: Number(g.outOf),
    comment: g.comment,
    published: g.published,
    updatedAt: g.updatedAt.toISOString(),
  };
}
