import { Injectable } from '@nestjs/common';
import type { Paginated } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { toIso } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { pageArgs, paginated } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ContactMessageDto,
  ContactMessageListQueryDto,
  CreateContactMessageDto,
} from './dto/contact.dto.js';

const include = {
  handledBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ContactMessageInclude;
type MessageRow = Prisma.ContactMessageGetPayload<{ include: typeof include }>;

/** Messages from the public contact form: stored for the secretariat, read and handled by admins. */
@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores a visitor's message. The visitor only gets a 204: nothing stored is sent back. */
  async create(dto: CreateContactMessageDto): Promise<void> {
    await this.prisma.contactMessage.create({
      data: {
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        phone: dto.phone ?? '',
        track: dto.track ?? '',
      },
    });
  }

  /** Newest first; `handled` keeps the waiting (false) or the handled (true) messages only. */
  async list(query: ContactMessageListQueryDto): Promise<Paginated<ContactMessageDto>> {
    const where: Prisma.ContactMessageWhereInput =
      query.handled === undefined ? {} : { handledAt: query.handled ? { not: null } : null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contactMessage.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.contactMessage.count({ where }),
    ]);
    return paginated(rows.map(toContactMessageDto), total, query);
  }

  /** Marks a message handled (by this admin, unless it already was) or waiting again. */
  async setHandled(id: string, handled: boolean, user: AuthUser): Promise<ContactMessageDto> {
    const current = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!current) throw notFound('Message');
    const row = await this.prisma.contactMessage.update({
      where: { id },
      data: handled
        ? {
            handledAt: current.handledAt ?? new Date(),
            handledById: current.handledAt ? current.handledById : user.id,
          }
        : { handledAt: null, handledById: null },
      include,
    });
    return toContactMessageDto(row);
  }
}

export function toContactMessageDto(m: MessageRow): ContactMessageDto {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    subject: m.subject,
    track: m.track,
    message: m.message,
    createdAt: m.createdAt.toISOString(),
    handledAt: toIso(m.handledAt),
    handledByName: m.handledBy ? `${m.handledBy.firstName} ${m.handledBy.lastName}` : null,
  };
}
