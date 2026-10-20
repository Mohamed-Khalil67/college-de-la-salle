import { BadRequestException, Injectable } from '@nestjs/common';
import type { Paginated } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { forbidden, notFound } from '../common/errors.js';
import { pageArgs, paginated } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePostDto, PostDto, PostListQueryDto } from './dto/post.dto.js';

const include = {
  author: { select: { firstName: true, lastName: true } },
} satisfies Prisma.PostInclude;

/** Announcements. Students read what is addressed to them; teachers post to their classes or wider. */
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(query: PostListQueryDto, user: AuthUser): Promise<Paginated<PostDto>> {
    let where: Prisma.PostWhereInput = {};
    if (user.studentId) {
      where = this.access.audienceFor(await this.access.placement(user.studentId));
    } else if (query.classId) {
      const c = await this.prisma.schoolClass.findUnique({ where: { id: query.classId } });
      if (!c) throw notFound('Classe');
      where = {
        OR: [
          { classId: null, sectionId: null },
          { classId: null, sectionId: c.sectionId },
          { classId: c.id },
        ],
      };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.post.count({ where }),
    ]);
    return paginated(rows.map(toPostDto), total, query);
  }

  async create(dto: CreatePostDto, user: AuthUser): Promise<PostDto> {
    if (dto.classId && dto.sectionId)
      throw new BadRequestException('Choisissez une classe ou une section, pas les deux.');
    if (dto.subjectId && !(await this.prisma.subject.findUnique({ where: { id: dto.subjectId } })))
      throw notFound('Matière');
    if (dto.sectionId && !(await this.prisma.section.findUnique({ where: { id: dto.sectionId } })))
      throw notFound('Section');
    if (dto.classId) {
      if (!(await this.prisma.schoolClass.findUnique({ where: { id: dto.classId } })))
        throw notFound('Classe');
      await this.access.assertTeachesClass(user, dto.classId);
    }
    const row = await this.prisma.post.create({
      data: {
        title: dto.title,
        body: dto.body,
        subjectId: dto.subjectId ?? null,
        classId: dto.classId ?? null,
        sectionId: dto.sectionId ?? null,
        authorId: user.id,
      },
      include,
    });
    return toPostDto(row);
  }

  /** The author or an admin. */
  async remove(id: string, user: AuthUser): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw notFound('Annonce');
    if (user.role !== 'admin' && post.authorId !== user.id) throw forbidden();
    await this.prisma.post.delete({ where: { id } });
  }
}

function toPostDto(p: Prisma.PostGetPayload<{ include: typeof include }>): PostDto {
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    subjectId: p.subjectId,
    classId: p.classId,
    sectionId: p.sectionId,
    authorId: p.authorId,
    authorName: `${p.author.firstName} ${p.author.lastName}`,
    createdAt: p.createdAt.toISOString(),
  };
}
