import { ConflictException, Injectable } from '@nestjs/common';
import type { SectionId } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { forbidden } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { concernsStudentNow } from '../targets/target-filters.js';
import { canEditStructure, canSetForAnyClass } from './grants.js';

export interface StudentPlacement {
  readonly classId: string;
  readonly classCode: string;
  readonly sectionId: string;
  readonly sectionCode: SectionId;
  readonly schoolYearId: string;
}

/**
 * Who may see or change what. The API's version of docs/legacy/firestore.rules, made stricter:
 * - a student sees their own grades (published only), attendance, homework and report cards, and the
 *   events and posts addressed to the whole school, their section or their class;
 * - a teacher reads every event and post, but writes grades, attendance and class events only for the
 *   classes (and subjects) of their teaching assignments, and edits only what they authored;
 * - a planner (a teacher or admin account marked so by the admin) also edits the year's structure;
 * - an admin may do everything.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async currentYear() {
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!year) throw new ConflictException('Aucune année scolaire en cours.');
    return year;
  }

  /** The student's class in the current school year, or null when not enrolled. */
  async placement(studentId: string): Promise<StudentPlacement | null> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, schoolYear: { isCurrent: true }, leftOn: null },
      include: { schoolClass: { include: { section: true } } },
    });
    if (!enrollment) return null;
    const c = enrollment.schoolClass;
    return {
      classId: c.id,
      classCode: c.code,
      sectionId: c.sectionId,
      sectionCode: c.section.code as SectionId,
      schoolYearId: enrollment.schoolYearId,
    };
  }

  /** Events and posts addressed to a student: the whole school, their section, or their class. */
  audienceFor(p: StudentPlacement | null): Prisma.EventWhereInput & Prisma.PostWhereInput {
    const wholeSchool = { classId: null, sectionId: null };
    if (!p) return wholeSchool;
    return { OR: [wholeSchool, { classId: null, sectionId: p.sectionId }, { classId: p.classId }] };
  }

  /**
   * Events addressed to a student: the whole school, their section, or their class; and, for the
   * assessments and homework of their class, only those that concern them (the whole class by default,
   * or a group they are in, or them by name). Events and posts share `audienceFor`; only events have targets.
   */
  eventAudienceFor(p: StudentPlacement | null, studentId: string): Prisma.EventWhereInput {
    const wholeSchool = { classId: null, sectionId: null };
    if (!p) return wholeSchool;
    return {
      OR: [
        wholeSchool,
        { classId: null, sectionId: p.sectionId },
        { AND: [{ classId: p.classId }, concernsStudentNow(studentId)] },
      ],
    };
  }

  /** The admin or a planner; everyone else is refused (structure writes reached from other routes). */
  assertCanEditStructure(user: AuthUser): void {
    if (!canEditStructure(user)) throw forbidden();
  }

  async teaches(teacherId: string, classId: string, subjectId?: string | null): Promise<boolean> {
    const count = await this.prisma.teachingAssignment.count({
      where: { teacherId, classSubject: { classId, ...(subjectId ? { subjectId } : {}) } },
    });
    return count > 0;
  }

  /** Admins pass; teachers must teach that class (and subject, when given); everyone else is refused. */
  async assertTeachesClass(
    user: AuthUser,
    classId: string,
    subjectId?: string | null,
  ): Promise<void> {
    if (user.role === 'admin') return;
    if (
      user.role === 'teacher' &&
      user.teacherId &&
      (await this.teaches(user.teacherId, classId, subjectId))
    )
      return;
    throw forbidden();
  }

  /**
   * May this user set an event of this type for this class? Whoever may set it for any class (the admin, or a
   * planner for an exam type: `canSetForAnyClass`), else a teacher of the class and subject (`assertTeachesClass`).
   */
  async assertCanSchedule(
    user: AuthUser,
    classId: string,
    subjectId: string | null,
    typeCode: string,
  ): Promise<void> {
    if (canSetForAnyClass(user, typeCode)) return;
    await this.assertTeachesClass(user, classId, subjectId);
  }

  /**
   * The teacher a mark or a roll call is recorded under: the signed-in teacher, else the event's own teacher,
   * else (an admin grading an exam a planner without a teacher profile set) a teacher of the class and subject.
   */
  async recorderFor(
    user: AuthUser,
    event: { readonly authorId: string | null; readonly classId: string | null; readonly subjectId: string | null },
  ): Promise<string> {
    const known = user.teacherId ?? event.authorId;
    if (known) return known;
    const assignment = event.classId
      ? await this.prisma.teachingAssignment.findFirst({
          where: {
            classSubject: {
              classId: event.classId,
              ...(event.subjectId ? { subjectId: event.subjectId } : {}),
            },
          },
          orderBy: { id: 'asc' },
          select: { teacherId: true },
        })
      : null;
    if (!assignment)
      throw new ConflictException('Aucun enseignant n’est affecté à cette classe et cette matière.');
    return assignment.teacherId;
  }

  /** May this user read this student's records? Themselves, a teacher of their class, or an admin. */
  async assertCanReadStudent(user: AuthUser, studentId: string): Promise<void> {
    if (user.role === 'admin') return;
    if (user.role === 'student') {
      if (user.studentId === studentId) return;
      throw forbidden();
    }
    const placement = await this.placement(studentId);
    if (user.teacherId && placement && (await this.teaches(user.teacherId, placement.classId)))
      return;
    throw forbidden();
  }

  /** Subjects this teacher teaches in this class (to scope what they see of a student's grades). */
  async subjectsTaught(teacherId: string, classId: string): Promise<string[]> {
    const rows = await this.prisma.teachingAssignment.findMany({
      where: { teacherId, classSubject: { classId } },
      select: { classSubject: { select: { subjectId: true } } },
    });
    return rows.map((r) => r.classSubject.subjectId);
  }
}
