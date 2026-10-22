import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { conflictOnUnique, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertClassWritable } from '../school-years/year-guard.js';
import type {
  CreateTeachingAssignmentDto,
  TeachingAssignmentDto,
  TeachingAssignmentQueryDto,
} from './dto/teaching-assignment.dto.js';

const include = {
  teacher: { include: { user: true } },
  classSubject: { include: { schoolClass: true, subject: true } },
} satisfies Prisma.TeachingAssignmentInclude;

/** Who teaches which subject of a class (a class subject): the basis of every teacher permission. */
@Injectable()
export class TeachingAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current-year assignments. A teacher always gets their own; admins filter freely. */
  async list(query: TeachingAssignmentQueryDto, user: AuthUser): Promise<TeachingAssignmentDto[]> {
    const teacherId = user.role === 'teacher' ? user.teacherId : query.teacherId;
    const rows = await this.prisma.teachingAssignment.findMany({
      where: {
        ...(teacherId ? { teacherId } : {}),
        classSubject: {
          ...(query.classId ? { classId: query.classId } : {}),
          schoolClass: { schoolYear: { isCurrent: true } },
        },
      },
      include,
      orderBy: [
        { classSubject: { schoolClass: { code: 'asc' } } },
        { classSubject: { subject: { name: 'asc' } } },
      ],
    });
    return rows.map(toDto);
  }

  async create(dto: CreateTeachingAssignmentDto, user: AuthUser): Promise<TeachingAssignmentDto> {
    const key = { teacherId: dto.teacherId, classSubjectId: dto.classSubjectId };
    if (
      await this.prisma.teachingAssignment.findUnique({
        where: { teacherId_classSubjectId: key },
      })
    ) {
      throw new ConflictException('Cette affectation existe déjà.');
    }
    const [teacher, classSubject] = await Promise.all([
      this.prisma.teacher.findUnique({ where: { id: dto.teacherId } }),
      this.prisma.classSubject.findUnique({ where: { id: dto.classSubjectId } }),
    ]);
    if (!teacher) throw notFound('Enseignant');
    if (!classSubject) throw notFound('Matière de la classe');
    // An assignment grants grade, attendance and event rights: it is a permission change, so it is audited.
    const work = this.prisma.$transaction(async (tx) => {
      await assertClassWritable(tx, classSubject.classId);
      const row = await tx.teachingAssignment.create({ data: key, include });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'teaching_assignment.create',
          entity: 'teaching_assignment',
          entityId: row.id,
          after: key,
        },
      ]);
      return toDto(row);
    });
    return conflictOnUnique(work, 'Cette affectation existe déjà.');
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const current = await this.prisma.teachingAssignment.findUnique({ where: { id } });
    if (!current) throw notFound('Affectation');
    await this.prisma.$transaction(async (tx) => {
      const subject = await tx.classSubject.findUnique({ where: { id: current.classSubjectId } });
      await assertClassWritable(tx, subject?.classId);
      await tx.teachingAssignment.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'teaching_assignment.delete',
          entity: 'teaching_assignment',
          entityId: id,
          before: { teacherId: current.teacherId, classSubjectId: current.classSubjectId },
        },
      ]);
    });
  }
}

function toDto(
  a: Prisma.TeachingAssignmentGetPayload<{ include: typeof include }>,
): TeachingAssignmentDto {
  return {
    id: a.id,
    teacherId: a.teacherId,
    teacherName: `${a.teacher.user.firstName} ${a.teacher.user.lastName}`,
    classSubjectId: a.classSubjectId,
    classId: a.classSubject.classId,
    classLabel: a.classSubject.schoolClass.label,
    subjectId: a.classSubject.subjectId,
    subjectName: a.classSubject.subject.name,
    coefficient: Number(a.classSubject.coefficient),
  };
}
