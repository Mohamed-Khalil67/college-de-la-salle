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

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('reports liveness without touching the database', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
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
