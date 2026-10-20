import { Injectable } from '@nestjs/common';
import { notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SubjectDto, UpdateSubjectDto } from './dto/subject.dto.js';

/**
 * The subject catalogue. Its ids come from MATIERES in packages/shared (seeded), so new subjects are
 * added there first; the admin can rename them here.
 */
@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<SubjectDto[]> {
    return this.prisma.subject.findMany({ orderBy: [{ group: 'asc' }, { name: 'asc' }] });
  }

  async update(id: string, dto: UpdateSubjectDto): Promise<SubjectDto> {
    if (!(await this.prisma.subject.findUnique({ where: { id } }))) throw notFound('Matière');
    return this.prisma.subject.update({ where: { id }, data: dto });
  }
}
