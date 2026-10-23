import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import { passwordProblems } from '@cdls/shared';
import { hash } from 'argon2';
import { audit } from '../common/audit.js';
import type { Env } from '../config/env.validation.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

const INVALID_LINK = 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.';
/** Used and expired rows are kept this long (for support), then deleted by the next request. */
const KEEP_MS = 24 * 3_600_000;

/**
 * « Mot de passe oublié »: an e-mailed single-use link. The token is random and opaque; only its HMAC is
 * stored, so a database leak yields no usable link. Nothing here tells a caller whether an account exists.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly ttlMs: number;
  private readonly key: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true }) * 60_000;
    // Same secret as the refresh tokens, with a prefix so the two uses never collide.
    this.key = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  /**
   * Mails a reset link to an active account. Resolves the same way for every identifier: the mail is sent
   * in the background (its outcome never reaches the caller) and a failure is only logged.
   */
  async request(identifier: string): Promise<void> {
    const email = identifier.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, status: true },
    });
    if (!user || user.status !== 'active') {
      // Same hashing work as a real request, so the two cases cost about the same.
      this.digest(randomBytes(32).toString('base64url'));
      return;
    }

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // A new request invalidates the earlier links of this account.
      await tx.passwordResetToken.deleteMany({
        where: { OR: [{ userId: user.id }, { expiresAt: { lt: new Date(now.getTime() - KEEP_MS) } }] },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.digest(token),
          expiresAt: new Date(now.getTime() + this.ttlMs),
        },
      });
    });

    void this.mail
      .sendPasswordReset(user.email, user.firstName, token, this.ttlMs / 60_000)
      .catch((error: unknown) => {
        // Never the token or the address in the log.
        this.logger.error(
          `Password reset mail for user ${user.id} could not be sent: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
  }

  /** Chooses the new password with the token of a link. The token works once, and only while valid. */
  async reset(token: string, newPassword: string): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.digest(token) },
      include: { user: { select: { id: true, email: true, status: true } } },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.status !== 'active')
      throw new BadRequestException(INVALID_LINK);
    // Checked before the token is spent: a weak password can be corrected on the same link.
    const problems = passwordProblems(newPassword, row.user.email);
    if (problems.length) throw new BadRequestException(problems);

    const passwordHash = await hash(newPassword);
    const userId = row.user.id;
    await this.prisma.$transaction(async (tx) => {
      // Claim the token: of two parallel requests with the same link, only one gets here.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new BadRequestException(INVALID_LINK);
      const updated = await tx.user.updateMany({
        where: { id: userId, status: 'active' },
        data: {
          passwordHash,
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
          passwordChangedAt: new Date(),
        },
      });
      if (updated.count === 0) throw new BadRequestException(INVALID_LINK);
      await tx.passwordResetToken.deleteMany({ where: { userId, id: { not: row.id } } });
      await audit(tx, [
        {
          actorId: userId,
          action: 'user.password_reset_self',
          entity: 'user',
          entityId: userId,
          after: { mustChangePassword: false },
        },
      ]);
    });
    // Refresh tokens end here; access tokens already stop through the new password version.
    await this.auth.revokeAll(userId);
  }

  private digest(token: string): string {
    return createHmac('sha256', this.key).update(`password-reset:${token}`).digest('hex');
  }
}
