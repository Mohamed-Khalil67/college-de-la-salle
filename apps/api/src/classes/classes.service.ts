import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { type SectionId, todayIso } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay } from '../common/dates.js';
import { conflictOnReference, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertClassWritable } from '../school-years/year-guard.js';
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

const CLASS_HAS_SLOTS =
  'Cette classe a des séances dans l’emploi du temps : supprimez-les d’abord.';
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

  /** Renames the class and/or sets the class of the next level (null: terminal class). */
  async update(id: string, dto: UpdateClassDto, user: AuthUser): Promise<ClassDto> {
    const current = await this.prisma.schoolClass.findUnique({ where: { id } });
    if (!current) throw notFound('Classe');
    if (dto.nextClassId) {
      if (dto.nextClassId === id)
        throw new BadRequestException('Une classe ne peut pas être sa propre classe suivante.');
      const next = await this.prisma.schoolClass.findUnique({ where: { id: dto.nextClassId } });
      if (!next) throw notFound('Classe suivante');
      if (next.schoolYearId !== current.schoolYearId || next.sectionId !== current.sectionId)
        throw new BadRequestException(
          'La classe suivante doit être de la même année et de la même section.',
        );
    }
    return this.prisma.$transaction(async (tx) => {
      await assertClassWritable(tx, id);
      // One change of the class links at a time: two admins cannot each close half of a loop.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('class-next-links', 0))`;
      if (dto.nextClassId) {
        // Walk the chain: a class cannot lead back to itself (promotion would never end).
        let cursor: string | null = dto.nextClassId;
        for (let hops = 0; cursor && hops < 50; hops++) {
          if (cursor === id) throw new BadRequestException('Cette classe suivante ferait une boucle.');
          cursor = (
            await tx.schoolClass.findUnique({ where: { id: cursor }, select: { nextClassId: true } })
          )?.nextClassId ?? null;
        }
      }
      const row = await tx.schoolClass.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.nextClassId !== undefined ? { nextClassId: dto.nextClassId } : {}),
        },
        include: classInclude,
      });
      if (dto.nextClassId !== undefined && dto.nextClassId !== current.nextClassId)
        await audit(tx, [
          {
            actorId: user.id,
            action: 'class.next_class',
            entity: 'school_class',
            entityId: id,
            before: { nextClassId: current.nextClassId },
            after: { nextClassId: dto.nextClassId },
          },
        ]);
      return toClassDto(row);
    });
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
      if (await tx.timetableSlot.count({ where: { classSubject: { classId: id } } }))
        throw new ConflictException(CLASS_HAS_SLOTS);
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

  /**
   * Enrols a student in a class of their section; moves them if they were in another class of the same
   * year (the old enrolment is closed today, or corrected when it started today). Changing section goes
   * through a section-change request, and archived students are read-only.
   */
  async enroll(classId: string, studentId: string): Promise<EnrollmentDto> {
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: classId } });
    if (!schoolClass) throw notFound('Classe');
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: { select: { status: true } } },
    });
    if (!student) throw notFound('Élève');
    if (student.user.status === 'archived')
      throw new ConflictException('Ce compte est archivé : restaurez-le avant de l’inscrire.');
    if (student.sectionId && student.sectionId !== schoolClass.sectionId)
      throw new ConflictException(
        'Cette classe est dans une autre section : changez de section par une demande (Validations).',
      );

    const today = fromDay(todayIso());
    const enrollment = await this.prisma.$transaction(async (tx) => {
      await assertClassWritable(tx, classId);
      // Read again inside the transaction: a section change may have been approved meanwhile.
      const current = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
      if (current.sectionId && current.sectionId !== schoolClass.sectionId)
        throw new ConflictException('La section de l’élève a changé : actualisez la page.');
      if (!current.sectionId)
        await tx.student.update({
          where: { id: studentId },
          data: { sectionId: schoolClass.sectionId },
        });
      const open = await tx.enrollment.findFirst({
        where: { studentId, schoolYearId: schoolClass.schoolYearId, leftOn: null },
      });
      if (open?.classId === classId) return open;
      if (open && open.enrolledOn.getTime() >= today.getTime())
        return tx.enrollment.update({ where: { id: open.id }, data: { classId } });
      if (open) await tx.enrollment.update({ where: { id: open.id }, data: { leftOn: today } });
      return tx.enrollment.create({
        data: { studentId, classId, schoolYearId: schoolClass.schoolYearId, enrolledOn: today },
      });
    });
    return toEnrollmentDto(enrollment);
  }

  /**
   * Takes a student off a class roster. The enrolment is closed today (`leftOn`), not deleted: it stays as
   * history, and the grades and attendance of that class keep their place. Closing a closed one is a no-op.
   */
  async unenroll(enrollmentId: string, actor: AuthUser): Promise<void> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { student: { include: { user: { select: { status: true } } } } },
    });
    if (!enrollment) throw notFound('Inscription');
    // An archived account is read-only, and its enrolments are history.
    if (enrollment.student.user.status === 'archived')
      throw new ConflictException('Ce compte est archivé : son inscription est conservée.');
    if (enrollment.leftOn) return;
    const today = fromDay(todayIso());
    await this.prisma.$transaction(async (tx) => {
      await assertClassWritable(tx, enrollment.classId);
      const closed = await tx.enrollment.updateMany({
        where: { id: enrollmentId, leftOn: null },
        data: { leftOn: today },
      });
      if (closed.count)
        await audit(tx, [
          {
            actorId: actor.id,
            action: 'enrollment.close',
            entity: 'enrollment',
            entityId: enrollmentId,
            before: { classId: enrollment.classId, leftOn: null },
            after: { leftOn: toDay(today) },
          },
        ]);
    });
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
    nextClassId: c.nextClassId,
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
