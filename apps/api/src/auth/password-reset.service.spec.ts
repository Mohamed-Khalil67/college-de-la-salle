import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BackgroundWork } from '../common/background-work.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { PasswordResetMailService } from './password-reset-mail.service.js';
import { linkToken } from './reset-link.js';
import { PasswordResetService } from './password-reset.service.js';

const ENV: Record<string, unknown> = {
  PASSWORD_RESET_TTL_MINUTES: 30,
  JWT_REFRESH_SECRET: 'x'.repeat(40),
};

describe('PasswordResetService', () => {
  const tx = {
    passwordResetToken: { deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    user: { updateMany: vi.fn() },
    auditLog: { createMany: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn() },
    passwordResetToken: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const auth = { revokeAll: vi.fn() };
  const mailer = { kick: vi.fn() };
  let service: PasswordResetService;

  beforeEach(async () => {
    vi.clearAllMocks();
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
        { provide: PasswordResetMailService, useValue: mailer },
        BackgroundWork,
        { provide: ConfigService, useValue: { get: (key: string) => ENV[key] } },
      ],
    }).compile();
    service = moduleRef.get(PasswordResetService);
  });

  const activeUser = { id: 'u1', email: 'prof@demo.cdls.test', firstName: 'Prof', status: 'active' };

  describe('request', () => {
    /** Lets the background work of `request` run to its end. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('answers before touching the database', () => {
      prisma.user.findUnique.mockReturnValue(new Promise(() => undefined));
      expect(service.request('prof@demo.cdls.test')).toBeUndefined();
      expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('then stores a seed and the hash of the derived token (never the token), replaces earlier links and queues the mail', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      service.request(' PROF@demo.cdls.test ');
      await vi.waitFor(() => expect(mailer.kick).toHaveBeenCalledTimes(1));
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'prof@demo.cdls.test' } }),
      );
      expect(tx.passwordResetToken.deleteMany).toHaveBeenCalled();
      const data = (
        tx.passwordResetToken.create.mock.calls[0]![0] as {
          data: { tokenHash: string; expiresAt: Date; mailSeed: string; mailNextAt: Date };
        }
      ).data;
      const token = linkToken(ENV['JWT_REFRESH_SECRET'] as string, data.mailSeed);
      expect(token).toMatch(/^[\w-]{43}$/);
      expect(data.mailSeed).toMatch(/^[\w-]{43}$/);
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.tokenHash).not.toContain(token);
      expect(JSON.stringify(data)).not.toContain(token);
      expect(data.mailNextAt).toBeInstanceOf(Date);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    });

    it.each([null, { ...activeUser, status: 'disabled' }, { ...activeUser, status: 'archived' }])(
      'queues nothing for %j',
      async (user) => {
        prisma.user.findUnique.mockResolvedValue(user);
        expect(service.request('x@demo.cdls.test')).toBeUndefined();
        await settle();
        expect(prisma.user.findUnique).toHaveBeenCalled();
        expect(mailer.kick).not.toHaveBeenCalled();
        expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
      },
    );

    it('only logs when the database fails', async () => {
      prisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
      expect(() => service.request('prof@demo.cdls.test')).not.toThrow();
      await settle();
      expect(mailer.kick).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    const row = (overrides = {}) => ({
      id: 't1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'prof@demo.cdls.test', status: 'active' },
      ...overrides,
    });

    it('sets the password, clears the first-sign-in flags, audits and revokes the sessions', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(row());
      await service.reset('token', 'Cedre-du-Liban-2026');
      expect(tx.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mustChangePassword: false,
            temporaryPasswordExpiresAt: null,
            passwordChangedAt: expect.any(Date),
          }),
        }),
      );
      const audited = (tx.auditLog.createMany.mock.calls[0]![0] as { data: { action: string }[] }).data;
      expect(audited[0]!.action).toBe('user.password_reset_self');
      expect(auth.revokeAll).toHaveBeenCalledWith('u1');
    });

    it.each([
      ['unknown', null],
      ['used', row({ usedAt: new Date() })],
      ['expired', row({ expiresAt: new Date(Date.now() - 1) })],
      ['of a disabled account', row({ user: { id: 'u1', email: 'a@b.test', status: 'disabled' } })],
    ])('refuses a token that is %s', async (_label, found) => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(found);
      await expect(service.reset('token', 'Cedre-du-Liban-2026')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(auth.revokeAll).not.toHaveBeenCalled();
    });

    it('refuses a weak password without spending the token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(row());
      await expect(service.reset('token', 'court')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.passwordResetToken.updateMany).not.toHaveBeenCalled();
    });

    it('loses a race for the same token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(row());
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.reset('token', 'Cedre-du-Liban-2026')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });
  });
});
