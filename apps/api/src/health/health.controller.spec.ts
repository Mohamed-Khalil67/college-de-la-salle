import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  const prisma = { $queryRaw: vi.fn() };
  /** A request made from inside the stack: no proxy header. */
  const direct = { headers: {} };
  let controller: HealthController;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('reports liveness with the version, without touching the database', () => {
    expect(controller.live()).toEqual({ status: 'ok', version: expect.stringMatching(/^\d+\.\d+\.\d+/), migration: null });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reads the last applied migration once at start and serves it from memory', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ zone: 'UTC' }])
      .mockResolvedValueOnce([{ migration_name: '20261113000000_x' }]);
    await moduleRef.get(HealthService).onApplicationBootstrap();
    expect(controller.live().migration).toBe('20261113000000_x');
    expect(controller.live().migration).toBe('20261113000000_x');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('refuses to start when the database session is not on UTC (stored instants would shift)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ zone: 'Africa/Cairo' }]);
    await expect(moduleRef.get(HealthService).onApplicationBootstrap()).rejects.toThrow(/Africa\/Cairo/);
  });

  it('checks the zone even when the migrations table cannot be read', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ zone: 'Africa/Cairo' }])
      .mockRejectedValueOnce(new Error('relation "_prisma_migrations" does not exist'));
    await expect(moduleRef.get(HealthService).onApplicationBootstrap()).rejects.toThrow(/Africa\/Cairo/);
  });

  it('falls back to the newest migration folder when the database cannot be asked', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    await moduleRef.get(HealthService).onApplicationBootstrap();
    expect(controller.live().migration).toMatch(/^\d{14}_/);
  });

  it('reports the database as ok when it answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.database(direct)).resolves.toEqual({ status: 'ok' });
  });

  it('answers 503 when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(controller.database(direct)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    { 'x-forwarded-for': '203.0.113.7' },
    { 'x-real-ip': '203.0.113.7' },
    { forwarded: 'for=203.0.113.7' },
  ])('refuses a request that came through the proxy (%j) without touching the database', async (headers) => {
    await expect(controller.database({ headers })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
