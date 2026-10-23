import { Injectable } from '@nestjs/common';
import {
  type NotificationKind,
  notificationLink,
  type NotificationText,
  type NotificationTopic,
  type Paginated,
  type Role,
} from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, schoolToday, toDay, toIso } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { pageArgs, paginated } from '../common/pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  MarkNotificationsReadResponseDto,
  NotificationDto,
  NotificationListQueryDto,
  NotificationPreferencesDto,
  NotificationSummaryDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification.dto.js';

type Db = Prisma.TransactionClient;

/** Someone a notification is for. */
export interface Recipient {
  readonly userId: string;
  readonly role: Role;
}

/** One change to announce, to everyone it concerns. */
export interface NotificationDraft {
  readonly kind: NotificationKind;
  readonly recipients: readonly Recipient[];
  /** Students and teachers may read a different text (teachers are also told the class). */
  readonly text: (role: Role) => NotificationText;
  readonly topic: NotificationTopic;
  /** YYYY-MM-DD the session, event or deadline happens; null for a grade. */
  readonly occursOn: string | null;
  readonly entity: string;
  readonly entityId: string;
}

const select = {
  id: true,
  kind: true,
  title: true,
  body: true,
  link: true,
  occursOn: true,
  createdAt: true,
  readAt: true,
} satisfies Prisma.NotificationSelect;

type Row = Prisma.NotificationGetPayload<{ select: typeof select }>;

export function toNotificationDto(row: Row): NotificationDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    occursOn: row.occursOn ? toDay(row.occursOn) : null,
    createdAt: row.createdAt.toISOString(),
    readAt: toIso(row.readAt),
  };
}

/**
 * In-app notifications: written by the services that change sessions, events and grades, in THEIR
 * transaction (`write`), so a change and its notifications commit or roll back together. Every user
 * reads and marks only their own.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stores the notifications of these drafts inside the caller's transaction. The actor is never told
   * about their own change; disabled and archived accounts get nothing; the users who opted in to
   * e-mails get the notification queued for the next digest, unless its day is already past.
   */
  async write(
    tx: Db,
    drafts: readonly NotificationDraft[],
    actorId: string | null,
  ): Promise<number> {
    const wanted: { draft: NotificationDraft; recipient: Recipient }[] = [];
    for (const draft of drafts) {
      const seen = new Set<string>();
      for (const recipient of draft.recipients) {
        if (recipient.userId === actorId || seen.has(recipient.userId)) continue;
        seen.add(recipient.userId);
        wanted.push({ draft, recipient });
      }
    }
    if (!wanted.length) return 0;
    const users = await tx.user.findMany({
      where: { id: { in: [...new Set(wanted.map((w) => w.recipient.userId))] }, status: 'active' },
      select: { id: true, notifyByEmail: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const today = schoolToday();
    const data: Prisma.NotificationCreateManyInput[] = [];
    for (const { draft, recipient } of wanted) {
      const user = byId.get(recipient.userId);
      if (!user) continue;
      const text = draft.text(recipient.role);
      const upcoming = draft.occursOn === null || draft.occursOn >= today;
      data.push({
        userId: user.id,
        kind: draft.kind,
        title: text.title,
        body: text.body,
        link: notificationLink(recipient.role, draft.topic),
        occursOn: draft.occursOn ? fromDay(draft.occursOn) : null,
        entity: draft.entity,
        entityId: draft.entityId,
        mailState: user.notifyByEmail && upcoming ? 'pending' : 'none',
      });
    }
    if (!data.length) return 0;
    return (await tx.notification.createMany({ data })).count;
  }

  /** The user's notifications, newest first. */
  async list(user: AuthUser, query: NotificationListQueryDto): Promise<Paginated<NotificationDto>> {
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(query.unread ? { readAt: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(rows.map(toNotificationDto), total, query);
  }

  async summary(user: AuthUser): Promise<NotificationSummaryDto> {
    return {
      unread: await this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    };
  }

  /** Marks one of the user's notifications read (again: nothing changes). Another user's is a 404. */
  async markRead(user: AuthUser, id: string): Promise<NotificationDto> {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({
      where: { id, userId: user.id },
      select,
    });
    if (!row) throw notFound('Notification');
    return toNotificationDto(row);
  }

  async markAllRead(user: AuthUser): Promise<MarkNotificationsReadResponseDto> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async preferences(user: AuthUser): Promise<NotificationPreferencesDto> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { notifyByEmail: true },
    });
    return { emailEnabled: row.notifyByEmail };
  }

  /**
   * Turns the e-mails on or off. Turning them off also drops what waits for the next digest; turning
   * them on only concerns the notifications to come.
   */
  async updatePreferences(
    user: AuthUser,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { notifyByEmail: dto.emailEnabled } });
      if (!dto.emailEnabled)
        await tx.notification.updateMany({
          where: { userId: user.id, mailState: 'pending' },
          data: { mailState: 'skipped' },
        });
    });
    return { emailEnabled: dto.emailEnabled };
  }

  /** Deletes the notifications created before `cutoff`; returns how many. */
  async purgeBefore(cutoff: Date): Promise<number> {
    return (await this.prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } }))
      .count;
  }
}
