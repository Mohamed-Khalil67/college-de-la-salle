import { ConflictException, Injectable } from '@nestjs/common';
import { SECTION_IDS, type SectionId } from '@cdls/shared';
import type { Subject } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { conflictOnUnique, notFound } from '../common/errors.js';
import { uniqueSlug } from '../common/slug.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateSubjectDto,
  SubjectDto,
  SubjectListQueryDto,
  UpdateSubjectDto,
} from './dto/subject.dto.js';

/**
 * The subject catalogue, edited by the admin and coordinators (MATIERES in packages/shared is only the
 * seed). A subject's id is a slug made from its name once, so renaming never breaks stored grades.
 */
@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SubjectListQueryDto = {}): Promise<SubjectDto[]> {
    const rows = await this.prisma.subject.findMany({
      where: query.includeArchived ? {} : { archivedAt: null },
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toSubjectDto);
  }

  async create(dto: CreateSubjectDto, user: AuthUser): Promise<SubjectDto> {
    if (
      await this.prisma.subject.findFirst({
        where: { name: { equals: dto.name, mode: 'insensitive' } },
      })
    )
      throw new ConflictException(`La matière « ${dto.name} » existe déjà.`);
    const id = await uniqueSlug(
      dto.name,
      async (slug) => !!(await this.prisma.subject.findUnique({ where: { id: slug } })),
    );
    const work = this.prisma.$transaction(async (tx) => {
      const row = await tx.subject.create({
        data: { id, name: dto.name, group: dto.group, sections: sortSections(dto.sections) },
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'subject.create',
          entity: 'subject',
          entityId: id,
          after: { name: dto.name, group: dto.group, sections: dto.sections },
        },
      ]);
      return toSubjectDto(row);
    });
    return conflictOnUnique(work, `La matière « ${dto.name} » existe déjà.`);
  }

  /**
   * Renames, regroups, changes the sections or archives a subject. A section can't be removed while classes
   * of that section have the subject.
   */
  async update(id: string, dto: UpdateSubjectDto, user: AuthUser): Promise<SubjectDto> {
    const current = await this.prisma.subject.findUnique({ where: { id } });
    if (!current) throw notFound('Matière');
    if (dto.sections) {
      const removed = current.sections.filter((s) => !dto.sections!.includes(s as SectionId));
      const inUse = removed.length
        ? await this.prisma.classSubject.count({
            where: { subjectId: id, schoolClass: { section: { code: { in: removed } } } },
          })
        : 0;
      if (inUse)
        throw new ConflictException(
          'Des classes de cette section ont encore cette matière : retirez-la de leurs matières d’abord.',
        );
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.subject.update({
        where: { id },
        data: {
          name: dto.name,
          group: dto.group,
          sections: dto.sections ? sortSections(dto.sections) : undefined,
          archivedAt:
            dto.archived === undefined
              ? undefined
              : dto.archived
                ? (current.archivedAt ?? new Date())
                : null,
        },
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'subject.update',
          entity: 'subject',
          entityId: id,
          before: snapshot(current),
          after: snapshot(row),
        },
      ]);
      return toSubjectDto(row);
    });
  }
}

/** Sections in their usual order. */
function sortSections(sections: readonly SectionId[]): SectionId[] {
  return SECTION_IDS.filter((s) => sections.includes(s));
}

function snapshot(s: Subject) {
  return { name: s.name, group: s.group, sections: s.sections, archived: !!s.archivedAt };
}

export function toSubjectDto(s: Subject): SubjectDto {
  return {
    id: s.id,
    name: s.name,
    group: s.group,
    sections: s.sections.filter((c): c is SectionId =>
      (SECTION_IDS as readonly string[]).includes(c),
    ),
    archived: !!s.archivedAt,
  };
}
