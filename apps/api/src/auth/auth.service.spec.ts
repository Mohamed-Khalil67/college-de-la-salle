import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

const ENV: Record<string, string> = {
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  JWT_REFRESH_SECRET: 'x'.repeat(40),
};

const ROW_ID = '0190d5b4-1c2a-7000-8000-000000000001';

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('access-token'), verifyAsync: vi.fn() };
  let auth: AuthService;

  const user = async (overrides = {}) => ({
    id: 'u1',
    email: 'prof@demo.cdls.test',
    role: 'teacher' as const,
    firstName: 'P',
    lastName: 'R',
    status: 'active' as const,
    mustChangePassword: false,
    passwordChangedAt: null as Date | null,
    passwordHash: await hash('correct horse'),
    student: null,
    teacher: { id: 't1' },
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.refreshToken.create.mockImplementation(({ data }: { data: object }) => ({
      id: ROW_ID,
      ...data,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: (key: string) => ENV[key] } },
      ],
    }).compile();
    auth = moduleRef.get(AuthService);
  });

  it('logs in with the right password and issues a refresh token', async () => {
    prisma.user.findUnique.mockResolvedValue(await user());
    const issued = await auth.login('PROF@demo.cdls.test ', 'correct horse');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'prof@demo.cdls.test' } }),
    );
    expect(issued.session).toMatchObject({
      accessToken: 'access-token',
      expiresIn: 900,
      user: { teacherId: 't1' },
    });
    expect(issued.refreshToken).toMatch(new RegExp(`^${ROW_ID}\\.[\\w-]{43}$`));
    expect(issued.refreshMaxAgeMs).toBe(7 * 86_400_000);
    // Only an HMAC of the secret is stored.
    const stored = prisma.refreshToken.create.mock.calls[0]![0].data.tokenHash as string;
    expect(issued.refreshToken).not.toContain(stored);
  });

  it("gives a student's session their current class", async () => {
    prisma.user.findUnique.mockResolvedValue(
      await user({
        role: 'student',
        teacher: null,
        student: { id: 's1', enrollments: [{ classId: 'c1' }] },
      }),
    );
    const issued = await auth.login('eleve@demo.cdls.test', 'correct horse');
    expect(issued.session.user).toMatchObject({ studentId: 's1', classId: 'c1', teacherId: null });

    prisma.user.findUnique.mockResolvedValue(
      await user({ role: 'student', teacher: null, student: { id: 's2', enrollments: [] } }),
    );
    const unenrolled = await auth.login('eleve@demo.cdls.test', 'correct horse');
    expect(unenrolled.session.user.classId).toBeNull();
  });

  it('refuses a wrong password, an unknown e-mail, a disabled and an archived account', async () => {
    prisma.user.findUnique.mockResolvedValue(await user());
    await expect(auth.login('prof@demo.cdls.test', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(auth.login('nobody@demo.cdls.test', 'x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    for (const status of ['disabled', 'archived']) {
      prisma.user.findUnique.mockResolvedValue(await user({ status }));
      await expect(auth.login('prof@demo.cdls.test', 'correct horse')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('answers 401, not 500, when the stored hash is not an argon2 hash', async () => {
    for (const passwordHash of ['x', 'not-a-real-hash', '']) {
      prisma.user.findUnique.mockResolvedValue(await user({ passwordHash }));
      await expect(auth.login('prof@demo.cdls.test', 'correct horse')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('puts the first-sign-in flag, section and class in the session', async () => {
    prisma.user.findUnique.mockResolvedValue(
      await user({
        role: 'student',
        teacher: null,
        mustChangePassword: true,
        student: {
          id: 's1',
          section: { code: 'bac' },
          enrollments: [{ classId: 'c1', schoolClass: { label: 'Première' } }],
        },
      }),
    );
    const issued = await auth.login('eleve@demo.cdls.test', 'correct horse');
    expect(issued.session.user).toMatchObject({
      mustChangePassword: true,
      sectionCode: 'bac',
      classLabel: 'Première',
    });
  });

  describe('changePassword', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => unknown) => work(prisma));
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUniqueOrThrow.mockImplementation(async () => ({
        ...(await user()),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      }));
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    });

    it('checks the current password', async () => {
      prisma.user.findUnique.mockResolvedValue(await user({ mustChangePassword: true }));
      await expect(auth.changePassword('u1', 'wrong', 'a-new-long-password')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('applies the rules: 10 characters, not the e-mail, not the current password', async () => {
      prisma.user.findUnique.mockResolvedValue(await user({ mustChangePassword: true }));
      for (const weak of ['short', 'prof@demo.cdls.test', 'PROF', 'correct horse']) {
        await expect(auth.changePassword('u1', 'correct horse', weak)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('refuses when the password changed in between (a reset or another change won)', async () => {
      prisma.user.findUnique.mockResolvedValue(await user({ mustChangePassword: true }));
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        auth.changePassword('u1', 'correct horse', 'Cedre-du-Liban-2026'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('stores the new password, clears the flag, revokes every session and issues a new one', async () => {
      prisma.user.findUnique.mockResolvedValue(await user({ mustChangePassword: true }));
      const issued = await auth.changePassword('u1', 'correct horse', 'Cedre-du-Liban-2026');
      const { where, data } = prisma.user.updateMany.mock.calls[0]![0];
      // Only while the password is still the one that was checked.
      expect(where).toMatchObject({ id: 'u1', status: 'active' });
      expect(where.passwordHash).toMatch(/^\$argon2/);
      expect(data).toMatchObject({ mustChangePassword: false, passwordChangedAt: expect.any(Date) });
      expect(data.passwordHash).toMatch(/^\$argon2/);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(issued.session.user.mustChangePassword).toBe(false);
      // The new token carries the new password version.
      expect(jwt.signAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({ pv: expect.any(Number) }),
        expect.anything(),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('userFromAccessToken', () => {
    it('refuses tokens issued before the last password change', async () => {
      const changedAt = new Date('2026-10-20T10:00:00.250Z');
      prisma.user.findUnique.mockResolvedValue(await user({ passwordChangedAt: changedAt }));
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', role: 'teacher' });
      expect(await auth.userFromAccessToken('before any version')).toBeNull();
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', role: 'teacher', pv: changedAt.getTime() - 1 });
      expect(await auth.userFromAccessToken('old')).toBeNull();
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', role: 'teacher', pv: changedAt.getTime() });
      expect(await auth.userFromAccessToken('new')).toMatchObject({ id: 'u1' });
    });

    it('accepts tokens without a version for accounts that never changed their password', async () => {
      prisma.user.findUnique.mockResolvedValue(await user());
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', role: 'teacher' });
      expect(await auth.userFromAccessToken('t')).toMatchObject({ id: 'u1' });
    });

    it('refuses archived and disabled accounts', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', role: 'teacher' });
      prisma.user.findUnique.mockResolvedValue(await user({ status: 'archived' }));
      expect(await auth.userFromAccessToken('t')).toBeNull();
      prisma.user.findUnique.mockResolvedValue(await user({ status: 'disabled' }));
      expect(await auth.userFromAccessToken('t')).toBeNull();
    });
  });

  it('rotates a valid refresh token', async () => {
    prisma.user.findUnique.mockResolvedValue(await user());
    const first = await auth.login('prof@demo.cdls.test', 'correct horse');
    const stored = prisma.refreshToken.create.mock.calls[0]![0].data;
    prisma.refreshToken.findUnique.mockResolvedValue({
      ...stored,
      id: ROW_ID,
      revokedAt: null,
      user: await user(),
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    const second = await auth.refresh(first.refreshToken);
    expect(second.session.accessToken).toBe('access-token');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: ROW_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes the whole family when a rotated token is used again', async () => {
    prisma.user.findUnique.mockResolvedValue(await user());
    const first = await auth.login('prof@demo.cdls.test', 'correct horse');
    const stored = prisma.refreshToken.create.mock.calls[0]![0].data;
    prisma.refreshToken.findUnique.mockResolvedValue({
      ...stored,
      id: ROW_ID,
      revokedAt: new Date(),
      user: await user(),
    });
    await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('refuses malformed and forged refresh tokens', async () => {
    await expect(auth.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: ROW_ID,
      tokenHash: '00'.repeat(32),
      revokedAt: null,
    });
    await expect(auth.refresh(`${ROW_ID}.${'a'.repeat(43)}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
