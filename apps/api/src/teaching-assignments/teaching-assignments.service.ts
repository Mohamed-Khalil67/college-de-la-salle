import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateTeachingAssignmentDto,
  TeachingAssignmentDto,
  TeachingAssignmentQueryDto,
} from './dto/teaching-assignment.dto.js';

const include = {
  teacher: { include: { user: true } },
  schoolClass: true,
  subject: true,
} satisfies Prisma.TeachingAssignmentInclude;

/** Who teaches which subject in which class: the basis of every teacher permission. */
@Injectable()
export class TeachingAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current-year assignments. A teacher always gets their own; admins filter freely. */
  async list(query: TeachingAssignmentQueryDto, user: AuthUser): Promise<TeachingAssignmentDto[]> {
    const teacherId = user.role === 'teacher' ? user.teacherId : query.teacherId;
    const rows = await this.prisma.teachingAssignment.findMany({
      where: {
        ...(teacherId ? { teacherId } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
        schoolClass: { schoolYear: { isCurrent: true } },
      },
      include,
      orderBy: [{ schoolClass: { code: 'asc' } }, { subject: { name: 'asc' } }],
    });
    return rows.map(toDto);
  }

  async create(dto: CreateTeachingAssignmentDto): Promise<TeachingAssignmentDto> {
    const key = { teacherId: dto.teacherId, classId: dto.classId, subjectId: dto.subjectId };
    if (
      await this.prisma.teachingAssignment.findUnique({
        where: { teacherId_classId_subjectId: key },
      })
    ) {
      throw new ConflictException('Cette affectation existe déjà.');
    }
    const [teacher, schoolClass, subject] = await Promise.all([
      this.prisma.teacher.findUnique({ where: { id: dto.teacherId } }),
      this.prisma.schoolClass.findUnique({ where: { id: dto.classId } }),
      this.prisma.subject.findUnique({ where: { id: dto.subjectId } }),
    ]);
    if (!teacher) throw notFound('Enseignant');
    if (!schoolClass) throw notFound('Classe');
    if (!subject) throw notFound('Matière');
    const data = { ...key, coefficient: dto.coefficient ?? 1 };
    return toDto(await this.prisma.teachingAssignment.create({ data, include }));
  }

  async remove(id: string): Promise<void> {
    if (!(await this.prisma.teachingAssignment.findUnique({ where: { id } })))
      throw notFound('Affectation');
    await this.prisma.teachingAssignment.delete({ where: { id } });
  }
}

function toDto(
  a: Prisma.TeachingAssignmentGetPayload<{ include: typeof include }>,
): TeachingAssignmentDto {
  return {
    id: a.id,
    teacherId: a.teacherId,
    teacherName: `${a.teacher.user.firstName} ${a.teacher.user.lastName}`,
    classId: a.classId,
    classLabel: a.schoolClass.label,
    subjectId: a.subjectId,
    subjectName: a.subject.name,
    coefficient: Number(a.coefficient),
  };
}
