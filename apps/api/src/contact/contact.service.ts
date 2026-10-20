import { Injectable } from '@nestjs/common';
import type { Paginated } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
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

  /**
   * Stores a visitor's message. The visitor only gets a 204: nothing stored is sent back. A filled-in
   * honeypot means a robot: the message is dropped, with the same answer.
   */
  async create(dto: CreateContactMessageDto): Promise<void> {
    if (dto.website?.trim()) return;
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

  /**
   * Marks a message handled (by this admin, unless another one already did) or waiting again; audited.
   * Marking is a conditional update, so two admins at once keep the first one as the handler.
   */
  async setHandled(id: string, handled: boolean, user: AuthUser): Promise<ContactMessageDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      if (!(await tx.contactMessage.findUnique({ where: { id }, select: { id: true } })))
        throw notFound('Message');
      const { count } = await tx.contactMessage.updateMany({
        where: handled ? { id, handledAt: null } : { id, handledAt: { not: null } },
        data: handled
          ? { handledAt: new Date(), handledById: user.id }
          : { handledAt: null, handledById: null },
      });
      if (count)
        await audit(tx, [
          {
            actorId: user.id,
            action: handled ? 'contact_message.handle' : 'contact_message.reopen',
            entity: 'contact_message',
            entityId: id,
          },
        ]);
      return tx.contactMessage.findUniqueOrThrow({ where: { id }, include });
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
