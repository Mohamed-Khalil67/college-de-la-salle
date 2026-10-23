import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
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
  const mail = { sendPasswordReset: vi.fn() };
  let service: PasswordResetService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mail.sendPasswordReset.mockResolvedValue(undefined);
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: (key: string) => ENV[key] } },
      ],
    }).compile();
    service = moduleRef.get(PasswordResetService);
  });

  const activeUser = { id: 'u1', email: 'prof@demo.cdls.test', firstName: 'Prof', status: 'active' };

  describe('request', () => {
    it('stores only a hash, replaces earlier links and mails the token', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      await service.request(' PROF@demo.cdls.test ');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'prof@demo.cdls.test' } }),
      );
      expect(tx.passwordResetToken.deleteMany).toHaveBeenCalled();
      const [, , token, minutes] = mail.sendPasswordReset.mock.calls[0] as [string, string, string, number];
      expect(token).toMatch(/^[\w-]{43}$/);
      expect(minutes).toBe(30);
      const data = (
        tx.passwordResetToken.create.mock.calls[0]![0] as { data: { tokenHash: string; expiresAt: Date } }
      ).data;
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.tokenHash).not.toContain(token);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    });

    it.each([null, { ...activeUser, status: 'disabled' }, { ...activeUser, status: 'archived' }])(
      'sends nothing for %j',
      async (user) => {
        prisma.user.findUnique.mockResolvedValue(user);
        await expect(service.request('x@demo.cdls.test')).resolves.toBeUndefined();
        expect(mail.sendPasswordReset).not.toHaveBeenCalled();
        expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
      },
    );

    it('does not fail when the mail cannot be sent', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      mail.sendPasswordReset.mockRejectedValue(new Error('smtp down'));
      await expect(service.request('prof@demo.cdls.test')).resolves.toBeUndefined();
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
