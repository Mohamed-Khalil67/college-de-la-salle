import { closeGroupMemberships } from '../groups/memberships.js';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { type Paginated, type SectionId, todayIso } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toIso } from '../common/dates.js';
import { forbidden, isUniqueViolation, notFound } from '../common/errors.js';
import { pageArgs, paginated } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ApproveSectionChangeDto,
  CreateSectionChangeDto,
  RejectSectionChangeDto,
  SectionChangeDto,
  SectionChangeListQueryDto,
} from './dto/section-change.dto.js';

const ALREADY_PENDING = 'Une demande de changement de section est déjà en attente pour cet élève.';
const ALREADY_DECIDED = 'Cette demande a déjà été traitée.';

const include = {
  student: {
    select: {
      userId: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      enrollments: {
        where: { leftOn: null, schoolYear: { isCurrent: true } },
        select: { schoolClass: { select: { label: true } } },
        take: 1,
      },
    },
  },
  fromSection: { select: { code: true } },
  toSection: { select: { code: true } },
  requestedBy: { select: { firstName: true, lastName: true } },
  decidedBy: { select: { firstName: true, lastName: true } },
  newClass: { select: { label: true } },
} satisfies Prisma.SectionChangeRequestInclude;

type RequestRow = Prisma.SectionChangeRequestGetPayload<{ include: typeof include }>;

/**
 * Section changes. A student asks for themself, or the secretariat (an admin) asks for a student; only
 * one request per student is pending at a time (partial unique index). An admin approves, which moves
 * the student in one transaction, or rejects with a note.
 */
@Injectable()
export class SectionChangesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SectionChangeListQueryDto): Promise<Paginated<SectionChangeDto>> {
    const where: Prisma.SectionChangeRequestWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sectionChangeRequest.findMany({
        where,
        include,
        // Oldest first while waiting; most recent decisions first otherwise.
        orderBy: query.status === 'pending' ? { createdAt: 'asc' } : { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.sectionChangeRequest.count({ where }),
    ]);
    return paginated(rows.map(toSectionChangeDto), total, query);
  }

  /** The signed-in student's own requests, most recent first. */
  async mine(user: AuthUser): Promise<SectionChangeDto[]> {
    if (!user.studentId) throw forbidden();
    const rows = await this.prisma.sectionChangeRequest.findMany({
      where: { studentId: user.studentId },
      include,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map(toSectionChangeDto);
  }

  async create(dto: CreateSectionChangeDto, user: AuthUser): Promise<SectionChangeDto> {
    let studentId: string;
    if (user.role === 'student') {
      if (!user.studentId || (dto.studentId && dto.studentId !== user.studentId)) throw forbidden();
      studentId = user.studentId;
    } else if (user.role === 'admin') {
      if (!dto.studentId) throw new BadRequestException('Choisissez l’élève concerné.');
      studentId = dto.studentId;
    } else {
      throw forbidden();
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: { select: { status: true } } },
    });
    if (!student) throw notFound('Élève');
    if (student.user.status === 'archived')
      throw new ConflictException('Ce compte est archivé : aucune demande n’est possible.');
    if (!student.sectionId)
      throw new ConflictException(
        'La section de l’élève n’est pas encore définie : inscrivez-le d’abord dans une classe.',
      );
    const toSection = await this.prisma.section.findUnique({ where: { code: dto.toSection } });
    if (!toSection) throw notFound('Section');
    if (toSection.id === student.sectionId)
      throw new BadRequestException('L’élève est déjà dans cette section.');
    if (
      await this.prisma.sectionChangeRequest.findFirst({ where: { studentId, status: 'pending' } })
    )
      throw new ConflictException(ALREADY_PENDING);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.sectionChangeRequest.create({
          data: {
            studentId,
            fromSectionId: student.sectionId!,
            toSectionId: toSection.id,
            reason: dto.reason,
            requestedById: user.id,
          },
          include,
        });
        await audit(tx, [
          {
            actorId: user.id,
            action: 'section_change.create',
            entity: 'section_change_request',
            entityId: created.id,
            after: {
              studentId,
              fromSectionId: student.sectionId,
              toSectionId: toSection.id,
              byStudent: user.role === 'student',
            },
          },
        ]);
        return created;
      });
      return toSectionChangeDto(row);
    } catch (error) {
      // Two requests sent at the same moment: the partial unique index keeps one.
      if (isUniqueViolation(error)) throw new ConflictException(ALREADY_PENDING);
      throw error;
    }
  }

  /**
   * Approves a pending request in ONE transaction: the request is claimed (pending → approved), the
   * student's current enrolment is closed today and a new one opened in `classId` (a class of the new
   * section, same school year), the student's section is set, and an audit row is written. Grades,
   * attendance and report cards stay where they are: they belong to the student, not the class.
   */
  async approve(
    id: string,
    dto: ApproveSectionChangeDto,
    actor: AuthUser,
  ): Promise<SectionChangeDto> {
    const today = fromDay(todayIso());
    try {
      await this.prisma.$transaction(async (tx) => {
        const request = await tx.sectionChangeRequest.findUnique({ where: { id } });
        if (!request) throw notFound('Demande');
        // Claims the request; a concurrent approval or rejection waits on this row and then finds nothing.
        const claimed = await tx.sectionChangeRequest.updateMany({
          where: { id, status: 'pending' },
          data: {
            status: 'approved',
            decidedById: actor.id,
            decidedAt: new Date(),
            decisionNote: dto.note ?? '',
            newClassId: dto.classId,
          },
        });
        if (claimed.count === 0) throw new ConflictException(ALREADY_DECIDED);

        const student = await tx.student.findUniqueOrThrow({
          where: { id: request.studentId },
          include: { user: { select: { status: true } } },
        });
        if (student.user.status === 'archived')
          throw new ConflictException('Ce compte est archivé : la demande ne peut plus être approuvée.');
        if (student.sectionId !== request.fromSectionId)
          throw new ConflictException('La section de l’élève a changé depuis la demande.');

        const schoolClass = await tx.schoolClass.findUnique({
          where: { id: dto.classId },
          include: { schoolYear: { select: { isCurrent: true } } },
        });
        if (!schoolClass) throw notFound('Classe');
        if (schoolClass.sectionId !== request.toSectionId || !schoolClass.schoolYear.isCurrent)
          throw new BadRequestException(
            'Choisissez une classe de la nouvelle section, pour l’année en cours.',
          );

        const open = await tx.enrollment.findFirst({
          where: { studentId: student.id, schoolYearId: schoolClass.schoolYearId, leftOn: null },
        });
        if (open) {
          await tx.enrollment.update({ where: { id: open.id }, data: { leftOn: today } });
          // The old class's groups end with the old enrolment.
          await closeGroupMemberships(tx, [student.id], today, open.classId);
        }
        await tx.enrollment.create({
          data: {
            studentId: student.id,
            classId: schoolClass.id,
            schoolYearId: schoolClass.schoolYearId,
            enrolledOn: today,
          },
        });
        await tx.student.update({
          where: { id: student.id },
          data: { sectionId: request.toSectionId },
        });
        await audit(tx, [
          {
            actorId: actor.id,
            action: 'student.section_change',
            entity: 'student',
            entityId: student.id,
            before: { sectionId: request.fromSectionId, classId: open?.classId ?? null },
            after: { sectionId: request.toSectionId, classId: schoolClass.id, requestId: id },
          },
        ]);
      });
    } catch (error) {
      // Another open enrolment appeared meanwhile (the one-open-enrolment index refused it).
      if (isUniqueViolation(error))
        throw new ConflictException('L’inscription de l’élève a changé entre-temps : réessayez.');
      throw error;
    }
    return this.get(id);
  }

  async reject(id: string, dto: RejectSectionChangeDto, actor: AuthUser): Promise<SectionChangeDto> {
    const rejected = await this.prisma.$transaction(async (tx) => {
      const result = await tx.sectionChangeRequest.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'rejected',
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: dto.note,
        },
      });
      if (result.count)
        await audit(tx, [
          {
            actorId: actor.id,
            action: 'section_change.reject',
            entity: 'section_change_request',
            entityId: id,
            before: { status: 'pending' },
            after: { status: 'rejected' },
          },
        ]);
      return result;
    });
    if (rejected.count === 0) {
      await this.get(id);
      throw new ConflictException(ALREADY_DECIDED);
    }
    return this.get(id);
  }

  private async get(id: string): Promise<SectionChangeDto> {
    const row = await this.prisma.sectionChangeRequest.findUnique({ where: { id }, include });
    if (!row) throw notFound('Demande');
    return toSectionChangeDto(row);
  }
}

export function toSectionChangeDto(r: RequestRow): SectionChangeDto {
  const byStudent = r.requestedById === r.student.userId;
  return {
    id: r.id,
    studentId: r.studentId,
    studentFirstName: r.student.user.firstName,
    studentLastName: r.student.user.lastName,
    studentEmail: r.student.user.email,
    currentClassLabel: r.student.enrollments[0]?.schoolClass.label ?? null,
    fromSection: r.fromSection.code as SectionId,
    toSection: r.toSection.code as SectionId,
    reason: r.reason,
    status: r.status,
    requestedByName: `${r.requestedBy.firstName} ${r.requestedBy.lastName}`,
    requestedByStudent: byStudent,
    createdAt: r.createdAt.toISOString(),
    decidedAt: toIso(r.decidedAt),
    decidedByName: r.decidedBy ? `${r.decidedBy.firstName} ${r.decidedBy.lastName}` : null,
    decisionNote: r.decisionNote,
    newClassLabel: r.newClass?.label ?? null,
  };
}
