import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackgroundWork } from '../common/background-work.js';
import type { Env } from '../config/env.validation.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { linkToken, retryDelayMs, validityMinutes } from './reset-link.js';

/** Between two scans of the outbox (the first send is not waiting for it: `kick()` runs right after the row is written). */
const SCAN_INTERVAL_MS = 30_000;
/** A claimed mail is not claimed again for this long: a crash while sending means a retry after it. */
const LEASE_MS = 2 * 60_000;
/** Mails one run handles at most. */
const BATCH = 25;

export interface ResetMailRun {
  readonly sent: number;
  readonly failed: number;
  /** Links that expired before their mail went out (their seed is erased, nothing is sent). */
  readonly expired: number;
}

/**
 * The outbox of « mot de passe oublié » mails: the same pattern as the notification digests (claim, send,
 * hand back on failure), on the `password_reset_tokens` row itself.
 *
 *  - A row with a `mailSeed` is a mail still to send; the token is derived from the seed (`reset-link.ts`),
 *    so no token is stored. The seed is erased once the mail is sent, and when the link expires.
 *  - Claim: `mailNextAt` is pushed LEASE_MS ahead with a conditional `updateMany` (one winner, even with two
 *    processes). Failure: `mailNextAt` = now + backoff (30 s doubling to 5 min), tried again until the link
 *    expires (`PASSWORD_RESET_TTL_MINUTES`, at most a day: after that no link is worth sending).
 *  - Delivery is at least once: a crash between the SMTP answer and the update repeats the same link.
 *  - A restart loses nothing once the row exists: the first scan after boot sends what is due.
 */
@Injectable()
export class PasswordResetMailService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PasswordResetMailService.name);
  private readonly key: string;
  #timer?: NodeJS.Timeout;
  #running = false;
  #again = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly background: BackgroundWork,
    config: ConfigService<Env, true>,
  ) {
    this.key = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  onApplicationBootstrap(): void {
    // Not awaited: start-up never waits on (or fails because of) the mail.
    this.#timer = setInterval(() => this.kick(), SCAN_INTERVAL_MS);
    this.#timer.unref();
    this.kick();
  }

  onApplicationShutdown(): void {
    clearInterval(this.#timer);
  }

  /**
   * Starts a run in the background (never throws, never awaited by a request). A request that arrives while
   * a run is in progress makes it scan once more when it ends.
   */
  kick(): void {
    if (this.background.closing) return;
    if (this.#running) {
      this.#again = true;
      return;
    }
    this.#running = true;
    void this.background.track(this.loop());
  }

  private async loop(): Promise<void> {
    try {
      do {
        this.#again = false;
        try {
          await this.run();
        } catch (error: unknown) {
          this.logger.error(
            `Password reset mail run failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      } while (this.#again && !this.background.closing);
    } finally {
      this.#running = false;
    }
  }

  /** One scan: erase the seeds of expired links, then claim, send or hand back each due mail. */
  async run(now = new Date()): Promise<ResetMailRun> {
    const expired = await this.prisma.passwordResetToken.updateMany({
      where: { mailSeed: { not: null }, expiresAt: { lte: now } },
      data: { mailSeed: null, mailNextAt: null },
    });
    if (expired.count)
      this.logger.warn(`${expired.count} password reset link(s) expired before their mail was sent.`);

    const due = await this.prisma.passwordResetToken.findMany({
      where: { mailSeed: { not: null }, mailNextAt: { lte: now }, expiresAt: { gt: now } },
      orderBy: [{ mailNextAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
      select: {
        id: true,
        userId: true,
        mailSeed: true,
        mailAttempts: true,
        expiresAt: true,
        user: { select: { email: true, firstName: true, status: true } },
      },
    });

    let sent = 0;
    let failed = 0;
    for (const row of due) {
      const seed = row.mailSeed;
      if (!seed) continue;
      // Only an inactive account is never mailed: drop the seed, the link is dead anyway.
      if (row.user.status !== 'active') {
        await this.prisma.passwordResetToken.updateMany({
          where: { id: row.id, mailSeed: seed },
          data: { mailSeed: null, mailNextAt: null },
        });
        continue;
      }
      const claimed = await this.prisma.passwordResetToken.updateMany({
        where: { id: row.id, mailSeed: seed, mailNextAt: { lte: now } },
        data: { mailNextAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (claimed.count !== 1) continue; // another run has it
      try {
        await this.mail.sendPasswordReset(
          row.user.email,
          row.user.firstName,
          linkToken(this.key, seed),
          validityMinutes(row.expiresAt, now),
        );
      } catch (error: unknown) {
        failed += 1;
        await this.prisma.passwordResetToken.updateMany({
          where: { id: row.id, mailSeed: seed },
          data: {
            mailNextAt: new Date(Date.now() + retryDelayMs(row.mailAttempts)),
            mailAttempts: { increment: 1 },
          },
        });
        // Never the token, the link or the address in the log (an SMTP message can quote the address): only the kind of error.
        const code = (error as { code?: unknown } | null)?.code;
        this.logger.error(
          `Password reset mail for user ${row.userId} could not be sent (attempt ${row.mailAttempts + 1}): ${error instanceof Error ? error.name : 'unknown error'}${typeof code === 'string' ? ` ${code}` : ''}`,
        );
        continue;
      }
      sent += 1;
      await this.prisma.passwordResetToken.updateMany({
        where: { id: row.id, mailSeed: seed },
        data: { mailSeed: null, mailNextAt: null, mailedAt: new Date(), mailAttempts: { increment: 1 } },
      });
    }
    return { sent, failed, expired: expired.count };
  }
}
