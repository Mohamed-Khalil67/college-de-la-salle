import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ContactRetentionService } from './contact-retention.service.js';
import { ContactService } from './contact.service.js';

describe('ContactRetentionService', () => {
  const contact = { purgeHandledBefore: vi.fn() };
  const config = { get: vi.fn(() => 30) };
  let retention: ContactRetentionService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactRetentionService,
        { provide: ContactService, useValue: contact },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    retention = moduleRef.get(ContactRetentionService);
  });

  afterEach(() => {
    retention.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('deletes what was handled CONTACT_RETENTION_DAYS days ago or earlier', async () => {
    contact.purgeHandledBefore.mockResolvedValue(2);
    await expect(retention.run(new Date('2026-10-20T03:00:00Z'))).resolves.toBe(2);
    expect(config.get).toHaveBeenCalledWith('CONTACT_RETENTION_DAYS', { infer: true });
    expect(contact.purgeHandledBefore).toHaveBeenCalledWith(new Date('2026-09-20T03:00:00Z'));
  });

  it('logs a failed run instead of throwing', async () => {
    contact.purgeHandledBefore.mockRejectedValue(new Error('database down'));
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(retention.run()).resolves.toBe(0);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('runs shortly after start-up, then once a day, and stops on shutdown', async () => {
    vi.useFakeTimers();
    contact.purgeHandledBefore.mockResolvedValue(0);
    retention.onApplicationBootstrap();
    expect(contact.purgeHandledBefore).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(contact.purgeHandledBefore).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(contact.purgeHandledBefore).toHaveBeenCalledTimes(2);
    retention.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);
    expect(contact.purgeHandledBefore).toHaveBeenCalledTimes(2);
  });
});
