import { ConflictException, Injectable } from '@nestjs/common';
import type { SectionId } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { toDay } from '../common/dates.js';
import { conflictOnReference, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ClassDto,
  CreateClassDto,
  EnrollmentDto,
  SectionDto,
  ClassStudentDto,
  StudentSummaryDto,
  UpdateClassDto,
} from './dto/class.dto.js';

const classInclude = {
  section: true,
  _count: { select: { enrollments: { where: { leftOn: null } } } },
} satisfies Prisma.SchoolClassInclude;

type ClassRow = Prisma.SchoolClassGetPayload<{ include: typeof classInclude }>;

const CLASS_HAS_STUDENTS =
  'Cette classe a encore des élèves inscrits : retirez-les avant de la supprimer.';

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async sections(): Promise<SectionDto[]> {
    const sections = await this.prisma.section.findMany({ orderBy: { code: 'desc' } });
    return sections.map((s) => ({ id: s.id, code: s.code as SectionId, label: s.label }));
  }

  /** Classes of a school year (the current one by default), by section then label. */
  async list(schoolYearId?: string): Promise<ClassDto[]> {
    const yearId = schoolYearId ?? (await this.access.currentYear()).id;
    const rows = await this.prisma.schoolClass.findMany({
      where: { schoolYearId: yearId },
      include: classInclude,
      orderBy: [{ section: { code: 'desc' } }, { code: 'asc' }],
    });
    return rows.map(toClassDto);
  }

  async get(id: string): Promise<ClassDto> {
    const row = await this.prisma.schoolClass.findUnique({ where: { id }, include: classInclude });
    if (!row) throw notFound('Classe');
    return toClassDto(row);
  }

  async create(dto: CreateClassDto): Promise<ClassDto> {
    const exists = await this.prisma.schoolClass.findUnique({
      where: {
        schoolYearId_sectionId_code: {
          schoolYearId: dto.schoolYearId,
          sectionId: dto.sectionId,
          code: dto.code,
        },
      },
    });
    if (exists) throw new ConflictException('Cette classe existe déjà pour cette année.');
    const row = await this.prisma.schoolClass.create({ data: dto, include: classInclude });
    return toClassDto(row);
  }

  async update(id: string, dto: UpdateClassDto): Promise<ClassDto> {
    await this.get(id);
    return toClassDto(
      await this.prisma.schoolClass.update({
        where: { id },
        data: { label: dto.label },
        include: classInclude,
      }),
    );
  }

  /**
   * Deletes a class created by mistake. Only an empty one: no enrolment (current or past), no grade,
   * attendance or report card. Its events, announcements and teaching assignments go with it.
   */
  async remove(id: string, user: AuthUser): Promise<void> {
    const work = this.prisma.$transaction(async (tx) => {
      // Lock the class and its events first: a grade or roll call saved meanwhile waits for this
      // transaction instead of being deleted with the events after the checks below.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM school_classes WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw notFound('Classe');
      await tx.$queryRaw`SELECT id FROM events WHERE class_id = ${id}::uuid FOR UPDATE`;
      const schoolClass = await tx.schoolClass.findUniqueOrThrow({ where: { id } });
      const [enrollments, reportCards, grades, attendance] = await Promise.all([
        tx.enrollment.count({ where: { classId: id } }),
        tx.reportCard.count({ where: { classId: id } }),
        tx.grade.count({ where: { event: { classId: id } } }),
        tx.attendance.count({ where: { event: { classId: id } } }),
      ]);
      if (enrollments) throw new ConflictException(CLASS_HAS_STUDENTS);
      if (reportCards || grades || attendance)
        throw new ConflictException(
          'Cette classe a déjà des notes, des absences ou des bulletins : elle ne peut pas être supprimée.',
        );
      await tx.schoolClass.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'class.delete',
          entity: 'school_class',
          entityId: id,
          before: {
            schoolYearId: schoolClass.schoolYearId,
            code: schoolClass.code,
            label: schoolClass.label,
          },
        },
      ]);
    });
    // A student enrolled between the checks and the delete (restrict foreign key).
    await conflictOnReference(work, CLASS_HAS_STUDENTS);
  }

  /** The class list: admins and the class's teachers. */
  async students(classId: string, user: AuthUser): Promise<ClassStudentDto[]> {
    await this.get(classId);
    await this.access.assertTeachesClass(user, classId);
    const enrollments = await this.#enrollments(classId);
    return enrollments.map((e) =>
      Object.assign(toStudentSummary(e.student), { enrollmentId: e.id }),
    );
  }

  /** Students currently enrolled in a class, by name. */
  async roster(classId: string): Promise<StudentSummaryDto[]> {
    const enrollments = await this.#enrollments(classId);
    return enrollments.map((e) => toStudentSummary(e.student));
  }

  #enrollments(classId: string) {
    return this.prisma.enrollment.findMany({
      where: { classId, leftOn: null },
      include: { student: { include: { user: true } } },
      orderBy: [
        { student: { user: { lastName: 'asc' } } },
        { student: { user: { firstName: 'asc' } } },
      ],
    });
  }

  /** Enrols a student; moves them if they were in another class of the same year. */
  async enroll(classId: string, studentId: string): Promise<EnrollmentDto> {
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: classId } });
    if (!schoolClass) throw notFound('Classe');
    if (!(await this.prisma.student.findUnique({ where: { id: studentId } })))
      throw notFound('Élève');
    const enrollment = await this.prisma.enrollment.upsert({
      where: { studentId_schoolYearId: { studentId, schoolYearId: schoolClass.schoolYearId } },
      create: { studentId, classId, schoolYearId: schoolClass.schoolYearId },
      update: { classId, leftOn: null },
    });
    return toEnrollmentDto(enrollment);
  }

  /** Removes a student from a class (the enrollment row is deleted). */
  async unenroll(enrollmentId: string): Promise<void> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw notFound('Inscription');
    await this.prisma.enrollment.delete({ where: { id: enrollmentId } });
  }
}

export function toStudentSummary(s: {
  id: string;
  userId: string;
  studentNumber: string | null;
  user: { firstName: string; lastName: string };
}): StudentSummaryDto {
  return {
    id: s.id,
    userId: s.userId,
    firstName: s.user.firstName,
    lastName: s.user.lastName,
    studentNumber: s.studentNumber,
  };
}

function toClassDto(c: ClassRow): ClassDto {
  return {
    id: c.id,
    schoolYearId: c.schoolYearId,
    sectionId: c.sectionId,
    sectionCode: c.section.code as SectionId,
    code: c.code,
    label: c.label,
    studentCount: c._count.enrollments,
  };
}

function toEnrollmentDto(e: {
  id: string;
  studentId: string;
  classId: string;
  schoolYearId: string;
  enrolledOn: Date;
  leftOn: Date | null;
}): EnrollmentDto {
  return {
    id: e.id,
    studentId: e.studentId,
    classId: e.classId,
    schoolYearId: e.schoolYearId,
    enrolledOn: toDay(e.enrolledOn),
    leftOn: e.leftOn ? toDay(e.leftOn) : null,
  };
}
