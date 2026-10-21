import { BadRequestException, Injectable } from '@nestjs/common';
import { averageOnTwenty } from '@cdls/shared';
import type { Grade, Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { toActivityTypeSummary } from '../activity-types/activity-types.service.js';
import { ClassesService } from '../classes/classes.service.js';
import { audit, type AuditEntry } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { eventInclude, type EventRow, toEventDto } from '../events/event.mapper.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { subjectWeights } from '../report-cards/compute.js';
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
  ) {}

  /** The whole class with each student's grade, for the entry grid. */
  async sheet(eventId: string, user: AuthUser): Promise<GradeSheetDto> {
    const event = await this.gradableEvent(eventId, user);
    const [roster, grades] = await Promise.all([
      this.classes.roster(event.classId!),
      this.prisma.grade.findMany({ where: { eventId } }),
    ]);
    const byStudent = new Map(grades.map((g) => [g.studentId, toGradeDto(g)]));
    return {
      event: toEventDto(event),
      rows: roster.map((student) => ({ student, grade: byStudent.get(student.id) ?? null })),
    };
  }

  /** Creates, corrects or removes (score null) grades; one audit row per change. */
  async save(eventId: string, dto: SaveGradesDto, user: AuthUser): Promise<GradeSheetDto> {
    const event = await this.gradableEvent(eventId, user);
    await this.periods.assertOpen(this.prisma, event.periodId);
    const roster = new Set((await this.classes.roster(event.classId!)).map((s) => s.id));
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
    await this.periods.assertOpen(this.prisma, event.periodId);
    await this.prisma.$transaction(async (tx) => {
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
    if (query.periodId) {
      // By the events' stored period, never by dates: editing a period's dates moves no grade.
      const period = await this.prisma.period.findUnique({ where: { id: query.periodId } });
      if (!period) throw notFound('Période');
      eventWhere.periodId = period.id;
      schoolYearId = period.schoolYearId;
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
    const grades = await this.prisma.grade.findMany({
      where: {
        studentId,
        ...(user.role === 'student' ? { published: true } : {}),
        event: eventWhere,
      },
      include: { event: { include: { activityType: true } } },
      orderBy: { event: { date: 'desc' } },
    });

    const bySubject = new Map<string, typeof grades>();
    for (const g of grades) {
      const key = g.event.subjectId ?? '';
      bySubject.set(key, [...(bySubject.get(key) ?? []), g]);
    }
    const coefficients = await this.subjectCoefficients(studentId, schoolYearId);
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

  /**
   * Subject coefficients of the student's class, as the report card weighs them: the class of the given
   * school year (the term's), or the current class. Empty when the student is not enrolled.
   */
  private async subjectCoefficients(
    studentId: string,
    schoolYearId: string | null,
  ): Promise<Map<string, number>> {
    const classId = schoolYearId
      ? (
          await this.prisma.enrollment.findUnique({
            where: { studentId_schoolYearId: { studentId, schoolYearId } },
            select: { classId: true },
          })
        )?.classId
      : (await this.access.placement(studentId))?.classId;
    if (!classId) return new Map();
    const rows = await this.prisma.classSubject.findMany({
      where: { classId },
      include: { subject: true },
    });
    const weights = subjectWeights(rows.map((r) => ({ ...r, coefficient: Number(r.coefficient) })));
    return new Map(weights.map((w) => [w.subjectId, w.coefficient]));
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
