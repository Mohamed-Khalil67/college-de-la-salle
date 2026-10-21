import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { passwordProblems, type SectionId, type SessionResponse, type SessionUser } from '@cdls/shared';
import { hash, verify } from 'argon2';
import type { AuthUser } from '../common/auth-user.js';
import { durationSeconds } from '../common/duration.js';
import type { Env } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AccessTokenPayload {
  readonly sub: string;
  readonly role: SessionUser['role'];
  /**
   * Password version: the user's passwordChangedAt in milliseconds (0 before any change). A token whose
   * version differs from the account's is refused, so a password change or reset ends every session.
   */
  readonly pv?: number;
}

/** The password version an access token must carry for this account. */
function passwordVersion(user: { passwordChangedAt: Date | null }): number {
  return user.passwordChangedAt?.getTime() ?? 0;
}

/** A session plus the refresh cookie value the controller must set. */
export interface IssuedSession {
  readonly session: SessionResponse;
  readonly refreshToken: string;
  readonly refreshMaxAgeMs: number;
}

const INVALID_LOGIN = 'E-mail ou mot de passe incorrect.';
const INVALID_SESSION = 'Session expirée. Reconnectez-vous.';
const WRONG_CURRENT_PASSWORD = 'Le mot de passe actuel est incorrect.';

const userInclude = {
  student: {
    select: {
      id: true,
      section: { select: { code: true } },
      // The current class (one open enrollment per student and school year).
      enrollments: {
        where: { leftOn: null, schoolYear: { isCurrent: true } },
        select: { classId: true, schoolClass: { select: { label: true } } },
        take: 1,
      },
    },
  },
  teacher: { select: { id: true, isCoordinator: true } },
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly refreshKey: string;
  /** Verified when the e-mail is unknown, so a login costs the same whether the account exists or not. */
  private readonly dummyHash = hash(randomBytes(16).toString('hex'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtl = durationSeconds(config.get('JWT_ACCESS_TTL', { infer: true }));
    this.refreshTtl = durationSeconds(config.get('JWT_REFRESH_TTL', { infer: true }));
    this.refreshKey = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  async login(email: string, password: string, userAgent = ''): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: userInclude,
    });
    const ok = user
      ? await verify(user.passwordHash, password)
      : (await verify(await this.dummyHash, password), false);
    // Disabled and archived accounts get the same answer as a wrong password.
    if (!user || !ok || user.status !== 'active') throw new UnauthorizedException(INVALID_LOGIN);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issue(toAuthUser(user), passwordVersion(user), randomUUID(), userAgent);
  }

  /** Rotates the refresh token. A token used twice means it leaked: its whole family is revoked. */
  async refresh(token: string | undefined, userAgent = ''): Promise<IssuedSession> {
    const parsed = this.parse(token);
    if (!parsed) throw new UnauthorizedException(INVALID_SESSION);
    const row = await this.prisma.refreshToken.findUnique({
      where: { id: parsed.id },
      include: { user: { include: userInclude } },
    });
    if (!row || !this.matches(row.tokenHash, parsed.secret))
      throw new UnauthorizedException(INVALID_SESSION);
    if (row.revokedAt) {
      this.logger.warn(`Refresh token reuse for user ${row.userId}; revoking its session family`);
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException(INVALID_SESSION);
    }
    if (row.expiresAt <= new Date() || row.user.status !== 'active')
      throw new UnauthorizedException(INVALID_SESSION);

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Lost a race with a concurrent refresh using the same token: treat as reuse.
    if (revoked.count === 0) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException(INVALID_SESSION);
    }
    return this.issue(toAuthUser(row.user), passwordVersion(row.user), row.familyId, userAgent);
  }

  async logout(token: string | undefined): Promise<void> {
    const parsed = this.parse(token);
    if (!parsed) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { id: parsed.id } });
    if (row && this.matches(row.tokenHash, parsed.secret)) await this.revokeFamily(row.familyId);
  }

  /**
   * The signed-in user chooses a new password: the current one must match, the new one follow
   * passwordProblems and differ from it. Clears mustChangePassword, signs out every session (their
   * access tokens carry the old password version and stop working) and returns a fresh session.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    userAgent = '',
  ): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: userInclude });
    if (!user || user.status !== 'active') throw new UnauthorizedException(INVALID_SESSION);
    if (!(await verify(user.passwordHash, currentPassword)))
      throw new BadRequestException(WRONG_CURRENT_PASSWORD);
    const problems = passwordProblems(newPassword, user.email);
    if (problems.length) throw new BadRequestException(problems);
    if (await verify(user.passwordHash, newPassword))
      throw new BadRequestException('Choisissez un mot de passe différent de l’actuel.');

    const newHash = await hash(newPassword);
    const updated = await this.prisma.$transaction(async (tx) => {
      // Only if the password is still the one that was checked: a reset or another change in between wins.
      const swapped = await tx.user.updateMany({
        where: { id: userId, passwordHash: user.passwordHash, status: 'active' },
        data: { passwordHash: newHash, mustChangePassword: false, passwordChangedAt: new Date() },
      });
      if (swapped.count === 0) throw new ConflictException('Votre mot de passe vient d’être modifié : reconnectez-vous.');
      const row = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return row;
    });
    return this.issue(toAuthUser(updated), passwordVersion(updated), randomUUID(), userAgent);
  }

  /** Signs out every session of a user (deactivation, password change). */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** The user behind an access token, or null when the token is invalid or the account inactive. */
  async userFromAccessToken(token: string): Promise<AuthUser | null> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: userInclude,
    });
    if (!user || user.status !== 'active') return null;
    // Tokens issued before a password change or reset no longer count.
    if ((payload.pv ?? 0) !== passwordVersion(user)) return null;
    return toAuthUser(user);
  }

  private async issue(
    user: AuthUser,
    pv: number,
    familyId: string,
    userAgent: string,
  ): Promise<IssuedSession> {
    const secret = randomBytes(32).toString('base64url');
    const row = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.hmac(secret),
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
        userAgent: userAgent.slice(0, 255),
      },
    });
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, pv };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: this.accessTtl });
    return {
      session: { accessToken, expiresIn: this.accessTtl, user: toSessionUser(user) },
      refreshToken: `${row.id}.${secret}`,
      refreshMaxAgeMs: this.refreshTtl * 1000,
    };
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private parse(token: string | undefined): { id: string; secret: string } | null {
    const match = /^([0-9a-f-]{36})\.([\w-]{43})$/.exec(token ?? '');
    return match ? { id: match[1]!, secret: match[2]! } : null;
  }

  private hmac(secret: string): string {
    return createHmac('sha256', this.refreshKey).update(secret).digest('hex');
  }

  private matches(storedHash: string, secret: string): boolean {
    const a = Buffer.from(storedHash, 'hex');
    const b = Buffer.from(this.hmac(secret), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

type UserWithProfiles = {
  id: string;
  email: string;
  role: AuthUser['role'];
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  student: {
    id: string;
    section?: { code: string } | null;
    enrollments?: readonly { classId: string; schoolClass?: { label: string } }[];
  } | null;
  teacher: { id: string; isCoordinator: boolean } | null;
};

export function toAuthUser(u: UserWithProfiles): AuthUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    studentId: u.student?.id ?? null,
    teacherId: u.teacher?.id ?? null,
    classId: u.student?.enrollments?.[0]?.classId ?? null,
    isCoordinator: u.teacher?.isCoordinator ?? false,
    classLabel: u.student?.enrollments?.[0]?.schoolClass?.label ?? null,
    sectionCode: (u.student?.section?.code as SectionId | undefined) ?? null,
    mustChangePassword: u.mustChangePassword,
  };
}

export function toSessionUser(u: AuthUser): SessionUser {
  return { ...u };
}
