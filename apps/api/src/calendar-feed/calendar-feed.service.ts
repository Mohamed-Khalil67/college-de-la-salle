import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { feedToken, parseFeedToken } from '@cdls/shared';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { toIso } from '../common/dates.js';
import type { Env } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CalendarFeedCreatedDto, CalendarFeedDto } from './dto/calendar-feed.dto.js';
import { FeedBuilderService } from './feed-builder.service.js';

/** One answer for every token that does not open a feed: malformed, unknown, revoked or outdated. */
const NO_FEED = 'Agenda introuvable.';
/** `lastUsedAt` is written at most this often (calendar apps poll; one write per poll is wasted). */
const TOUCH_MS = 15 * 60_000;
const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? 0) === (b?.getTime() ?? 0);

/**
 * « Synchroniser mon agenda »: one secret feed address per user. The token is the feed's id and a random
 * secret; only an HMAC of the secret is stored (same key as the refresh tokens, its own prefix), compared
 * in constant time. The feed answers only while the account is active and its password version is the
 * one the link was made with: a password change or reset, disabling, archiving or restoring the account
 * end it, as does revoking it or making a new one.
 */
@Injectable()
export class CalendarFeedService {
  private readonly key: string;
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: FeedBuilderService,
    config: ConfigService<Env, true>,
  ) {
    this.key = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.webUrl = config.get('PUBLIC_WEB_URL', { infer: true });
  }

  async status(user: AuthUser): Promise<CalendarFeedDto> {
    const row = await this.prisma.calendarFeed.findUnique({
      where: { userId: user.id },
      select: {
        createdAt: true,
        lastUsedAt: true,
        passwordVersion: true,
        user: { select: { passwordChangedAt: true } },
      },
    });
    // A link made before the last password change no longer works: it is shown as none.
    if (!row || !same(row.passwordVersion, row.user.passwordChangedAt))
      return { active: false, createdAt: null, lastUsedAt: null };
    return {
      active: true,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: toIso(row.lastUsedAt),
    };
  }

  /** A new address; the previous one (if any) stops working at once. The address is returned only here. */
  async create(user: AuthUser): Promise<CalendarFeedCreatedDto> {
    const secret = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const row = await this.prisma.$transaction(async (tx) => {
      const account = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordChangedAt: true },
      });
      const replaced = await tx.calendarFeed.deleteMany({ where: { userId: user.id } });
      const created = await tx.calendarFeed.create({
        data: {
          id,
          userId: user.id,
          secretHash: this.digest(secret),
          passwordVersion: account.passwordChangedAt,
        },
      });
      // Never the token or the address in the log.
      await audit(tx, [
        {
          actorId: user.id,
          action: 'calendar_feed.create',
          entity: 'calendar_feed',
          entityId: created.id,
          after: { replaced: replaced.count > 0 },
        },
      ]);
      return created;
    });
    return {
      active: true,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: null,
      url: `${this.webUrl}/api/calendar/feed/${feedToken(row.id, secret)}.ics`,
    };
  }

  /** Revokes the address: calendar apps get 404 from now on. */
  async revoke(user: AuthUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.calendarFeed.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!rows.length) return;
      await tx.calendarFeed.deleteMany({ where: { userId: user.id } });
      await audit(
        tx,
        rows.map((r) => ({
          actorId: user.id,
          action: 'calendar_feed.revoke',
          entity: 'calendar_feed',
          entityId: r.id,
        })),
      );
    });
  }

  /** The feed behind `<token>.ics`, or the same 404 for anything that is not a working token. */
  async render(file: string, now = new Date()): Promise<string> {
    const parsed = file.endsWith('.ics') ? parseFeedToken(file.slice(0, -4)) : null;
    // Hashed even for a malformed token, so every refusal costs about the same.
    const presented = Buffer.from(this.digest(parsed?.secret ?? 'x'.repeat(43)), 'hex');
    const row = parsed
      ? await this.prisma.calendarFeed.findUnique({
          where: { id: parsed.id },
          select: {
            id: true,
            secretHash: true,
            passwordVersion: true,
            lastUsedAt: true,
            user: {
              select: {
                role: true,
                status: true,
                passwordChangedAt: true,
                firstName: true,
                lastName: true,
                student: { select: { id: true } },
                teacher: { select: { id: true } },
              },
            },
          },
        })
      : null;
    const stored = Buffer.from(row?.secretHash ?? '0'.repeat(64), 'hex');
    const matches = stored.length === presented.length && timingSafeEqual(stored, presented);
    if (
      !row ||
      !matches ||
      row.user.status !== 'active' ||
      !same(row.passwordVersion, row.user.passwordChangedAt) ||
      (row.user.role !== 'student' && row.user.role !== 'teacher')
    )
      throw new NotFoundException(NO_FEED);
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_MS)
      await this.prisma.calendarFeed.updateMany({
        where: { id: row.id },
        data: { lastUsedAt: now },
      });
    return this.builder.build(
      {
        role: row.user.role,
        studentId: row.user.student?.id ?? null,
        teacherId: row.user.teacher?.id ?? null,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
      },
      now,
    );
  }

  private digest(secret: string): string {
    return createHmac('sha256', this.key).update(`calendar-feed:${secret}`).digest('hex');
  }
}
