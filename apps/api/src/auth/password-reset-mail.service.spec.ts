import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BackgroundWork } from '../common/background-work.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordResetMailService } from './password-reset-mail.service.js';
import { linkToken, retryDelayMs } from './reset-link.js';

const KEY = 'x'.repeat(40);
const NOW = new Date('2026-10-04T10:00:00Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  userId: 'u1',
  mailSeed: 'seed-0123456789',
  mailAttempts: 0,
  expiresAt: new Date(NOW.getTime() + 60 * 60_000),
  user: { email: 'prof@demo.cdls.test', firstName: 'Prof', status: 'active' },
  ...over,
});

describe('PasswordResetMailService', () => {
  const prisma = {
    passwordResetToken: { updateMany: vi.fn(), findMany: vi.fn() },
  };
  const mail = { sendPasswordReset: vi.fn() };
  let service: PasswordResetMailService;
  let background: BackgroundWork;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.findMany.mockResolvedValue([]);
    mail.sendPasswordReset.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetMailService,
        BackgroundWork,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'JWT_REFRESH_SECRET' ? KEY : undefined) } },
      ],
    }).compile();
    service = moduleRef.get(PasswordResetMailService);
    background = moduleRef.get(BackgroundWork);
  });

  /** The update that matches a state change on the row (not the expiry sweep, not the claim). */
  const updates = () =>
    prisma.passwordResetToken.updateMany.mock.calls.map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> });

  it('mails the token derived from the seed, with the minutes the link has left, then erases the seed', async () => {
    prisma.passwordResetToken.findMany.mockResolvedValue([row()]);
    const result = await service.run(NOW);
    expect(result).toEqual({ sent: 1, failed: 0, expired: 1 });
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(
      'prof@demo.cdls.test',
      'Prof',
      linkToken(KEY, 'seed-0123456789'),
      60,
    );
    const done = updates().at(-1)!;
    expect(done.data).toMatchObject({ mailSeed: null, mailNextAt: null, mailedAt: expect.any(Date) as Date });
  });

  it('erases the seeds of links that expired before their mail left, and never selects them for sending', async () => {
    await service.run(NOW);
    expect(updates()[0]).toEqual({
      where: { mailSeed: { not: null }, expiresAt: { lte: NOW } },
      data: { mailSeed: null, mailNextAt: null },
    });
    expect(prisma.passwordResetToken.findMany.mock.calls[0]![0]).toMatchObject({
      where: { expiresAt: { gt: NOW } },
    });
  });

  it('claims before sending, with a lease, and skips a mail another run already claimed', async () => {
    prisma.passwordResetToken.findMany.mockResolvedValue([row()]);
    prisma.passwordResetToken.updateMany
      .mockResolvedValueOnce({ count: 0 }) // expiry sweep
      .mockResolvedValueOnce({ count: 0 }); // claim lost
    const result = await service.run(NOW);
    expect(result.sent).toBe(0);
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    const claim = updates()[1]!;
    expect(claim.where).toMatchObject({ id: 'r1', mailSeed: 'seed-0123456789' });
    expect((claim.data['mailNextAt'] as Date).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('keeps the seed and schedules a retry when the send fails, and logs neither token nor address', async () => {
    prisma.passwordResetToken.findMany.mockResolvedValue([row({ mailAttempts: 2 })]);
    mail.sendPasswordReset.mockRejectedValue(
      Object.assign(new Error('550 prof@demo.cdls.test rejected'), { code: 'EENVELOPE' }),
    );
    const errors: string[] = [];
    const log = vi.spyOn((service as unknown as { logger: { error(m: string): void } }).logger, 'error');
    log.mockImplementation((m: string) => void errors.push(m));
    const before = Date.now();
    const result = await service.run(NOW);
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    const retry = updates().at(-1)!;
    expect(retry.data['mailSeed']).toBeUndefined();
    expect(retry.data['mailAttempts']).toEqual({ increment: 1 });
    expect((retry.data['mailNextAt'] as Date).getTime()).toBeGreaterThanOrEqual(before + retryDelayMs(2) - 5);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('user u1');
    expect(errors[0]).not.toMatch(/prof@demo|seed-0123|rejected/);
  });

  it('treats a send that never answers as a failure (backoff), so the outbox does not stall', async () => {
    vi.useFakeTimers();
    try {
      prisma.passwordResetToken.findMany.mockResolvedValue([row()]);
      mail.sendPasswordReset.mockReturnValue(new Promise(() => undefined));
      const log = vi.spyOn((service as unknown as { logger: { error(m: string): void } }).logger, 'error').mockImplementation(() => undefined);
      const pending = service.run(NOW);
      await vi.advanceTimersByTimeAsync(61_000);
      await expect(pending).resolves.toMatchObject({ sent: 0, failed: 1 });
      expect(log.mock.calls[0]![0]).toContain('TimeoutError');
      expect(updates().at(-1)!.data['mailAttempts']).toEqual({ increment: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('goes on with the next mail when the update after a send fails, and logs only the user id', async () => {
    prisma.passwordResetToken.findMany.mockResolvedValue([row(), row({ id: 'r2', userId: 'u2' })]);
    prisma.passwordResetToken.updateMany
      .mockResolvedValueOnce({ count: 0 }) // expiry sweep
      .mockResolvedValueOnce({ count: 1 }) // claim r1
      .mockRejectedValueOnce(new Error('connection lost')) // record r1: fails
      .mockResolvedValue({ count: 1 });
    const log = vi.spyOn((service as unknown as { logger: { error(m: string): void } }).logger, 'error').mockImplementation(() => undefined);
    const result = await service.run(NOW);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(1);
    expect(log.mock.calls[0]![0]).toContain('user u1');
    expect(log.mock.calls[0]![0]).not.toContain('connection lost');
  });

  it.each(['disabled', 'archived'])('sends nothing to a %s account and erases the seed', async (status) => {
    prisma.passwordResetToken.findMany.mockResolvedValue([row({ user: { email: 'a@b.test', firstName: 'A', status } })]);
    const result = await service.run(NOW);
    expect(result.sent).toBe(0);
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    expect(updates().at(-1)!.data).toEqual({ mailSeed: null, mailNextAt: null });
  });

  it('kick runs in the background, tracked for shutdown, and coalesces a second kick into one more scan', async () => {
    let release: () => void = () => undefined;
    prisma.passwordResetToken.findMany.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );
    service.kick();
    service.kick();
    service.kick();
    expect(background.pending).toBe(1);
    await vi.waitFor(() => expect(prisma.passwordResetToken.findMany).toHaveBeenCalledTimes(1));
    release();
    await vi.waitFor(() => expect(prisma.passwordResetToken.findMany).toHaveBeenCalledTimes(2));
    await expect(background.drain(1000)).resolves.toBe(true);
    expect(prisma.passwordResetToken.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not start a run once shutdown began, and a shutdown waits for a send in progress', async () => {
    let finishSend: () => void = () => undefined;
    prisma.passwordResetToken.findMany.mockResolvedValue([row()]);
    mail.sendPasswordReset.mockImplementation(() => new Promise<void>((resolve) => (finishSend = resolve)));
    service.kick();
    await vi.waitFor(() => expect(mail.sendPasswordReset).toHaveBeenCalled());

    let drained = false;
    const draining = background.drain(2000).then((ok) => void (drained = ok));
    await new Promise((r) => setTimeout(r, 20));
    expect(drained).toBe(false);
    service.kick(); // refused: closing
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);

    finishSend();
    await draining;
    expect(drained).toBe(true);
    // The result of the send was written before the database went away.
    expect(updates().at(-1)!.data).toMatchObject({ mailSeed: null, mailedAt: expect.any(Date) as Date });
  });
});
