import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { notificationsPage } from '@cdls/shared';
import { fromDay, schoolToday } from '../common/dates.js';
import type { Env } from '../config/env.validation.js';
import { RETENTION_INTERVAL_MS, retentionCutoff } from '../contact/retention.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

/** A notification not mailed within this delay is no news any more: it is skipped. */
const MAIL_MAX_AGE_MS = 24 * 3_600_000;
/** Notifications one run mails at most (the rest waits for the next run). */
const BATCH = 500;

export interface DigestRun {
  readonly mails: number;
  readonly sent: number;
  readonly skipped: number;
}

/**
 * The e-mail side of notifications, for the users who opted in: every NOTIFICATION_MAIL_INTERVAL_MINUTES,
 * one mail per user listing what happened since the last one (never one mail per change), nothing for a
 * session already past, a notification already read or one over a day old. Also deletes notifications
 * older than NOTIFICATION_RETENTION_DAYS once a day. A plain timer is enough for one API process.
 */
@Injectable()
export class NotificationMailService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationMailService.name);
  #digest?: NodeJS.Timeout;
  #daily?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    const every = this.config.get('NOTIFICATION_MAIL_INTERVAL_MINUTES', { infer: true }) * 60_000;
    // Not awaited: start-up never waits on (or fails because of) a digest.
    this.#digest = setInterval(() => void this.safely('digest', () => this.sendDigests()), every);
    this.#digest.unref();
    this.#daily = setInterval(
      () => void this.safely('retention', () => this.purge()),
      RETENTION_INTERVAL_MS,
    );
    this.#daily.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.#digest);
    clearInterval(this.#daily);
  }

  /** One digest run. Returns what it did (the e2e tests call it directly). */
  async sendDigests(now = new Date()): Promise<DigestRun> {
    const today = schoolToday(now);
    const stale = await this.prisma.notification.updateMany({
      where: {
        mailState: 'pending',
        OR: [
          { occursOn: { lt: fromDay(today) } },
          { readAt: { not: null } },
          { createdAt: { lt: new Date(now.getTime() - MAIL_MAX_AGE_MS) } },
          { user: { OR: [{ notifyByEmail: false }, { status: { not: 'active' } }] } },
        ],
      },
      data: { mailState: 'skipped' },
    });
    const pending = await this.prisma.notification.findMany({
      where: { mailState: 'pending' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
      select: {
        id: true,
        userId: true,
        title: true,
        body: true,
        user: { select: { email: true, firstName: true, role: true } },
      },
    });
    const byUser = new Map<string, typeof pending>();
    for (const n of pending) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
    let mails = 0;
    let sent = 0;
    for (const [userId, items] of byUser) {
      const ids = items.map((n) => n.id);
      // Claimed before sending: a second process (or run) never mails them again.
      const claimed = await this.prisma.notification.updateMany({
        where: { id: { in: ids }, mailState: 'pending' },
        data: { mailState: 'sent', mailedAt: now },
      });
      if (claimed.count !== ids.length) {
        // Another run took some of them: give the rest back, they go in that run's next pass.
        await this.prisma.notification.updateMany({
          where: { id: { in: ids }, mailedAt: now },
          data: { mailState: 'pending', mailedAt: null },
        });
        continue;
      }
      const user = items[0]!.user;
      try {
        await this.mail.sendNotificationDigest(
          user.email,
          user.firstName,
          items.map((n) => ({ title: n.title, body: n.body })),
          notificationsPage(user.role),
        );
        mails += 1;
        sent += ids.length;
      } catch (error) {
        // Retried at the next run (until they are a day old). Never the address in the log.
        await this.prisma.notification.updateMany({
          where: { id: { in: ids } },
          data: { mailState: 'pending', mailedAt: null },
        });
        this.logger.error(
          `Notification digest for user ${userId} could not be sent: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    return { mails, sent, skipped: stale.count };
  }

  /** Deletes the notifications older than the retention; returns how many. */
  async purge(now = new Date()): Promise<number> {
    const days = this.config.get('NOTIFICATION_RETENTION_DAYS', { infer: true });
    const count = await this.notifications.purgeBefore(retentionCutoff(now, days));
    if (count) this.logger.log(`Deleted ${count} notification(s) created over ${days} days ago.`);
    return count;
  }

  private async safely(what: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Notification ${what} failed`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
