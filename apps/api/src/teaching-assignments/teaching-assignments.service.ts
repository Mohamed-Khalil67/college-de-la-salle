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

  async create(dto: CreateTeachingAssignmentDto): Promise<TeachingAssignmentDto> {
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
    return toDto(await this.prisma.teachingAssignment.create({ data: key, include }));
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
    classSubjectId: a.classSubjectId,
    classId: a.classSubject.classId,
    classLabel: a.classSubject.schoolClass.label,
    subjectId: a.classSubject.subjectId,
    subjectName: a.classSubject.subject.name,
    coefficient: Number(a.classSubject.coefficient),
  };
}
