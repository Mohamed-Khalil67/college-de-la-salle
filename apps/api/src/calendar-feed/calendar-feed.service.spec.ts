import { createHmac } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { feedToken } from '@cdls/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarFeedService } from './calendar-feed.service.js';
import { FeedBuilderService } from './feed-builder.service.js';

const KEY = 'k'.repeat(48);
const ID = '0193b2c4-7d1e-7a00-8b11-123456789abc';
const SECRET = 'S'.repeat(43);
const hash = (secret: string) =>
  createHmac('sha256', KEY).update(`calendar-feed:${secret}`).digest('hex');
const changedAt = new Date('2026-10-01T10:00:00.000Z');

const row = (over: Record<string, unknown> = {}, user: Record<string, unknown> = {}) => ({
  id: ID,
  secretHash: hash(SECRET),
  passwordVersion: changedAt,
  lastUsedAt: new Date(),
  user: {
    role: 'student',
    status: 'active',
    passwordChangedAt: changedAt,
    firstName: 'Nadia',
    lastName: 'Saleh',
    student: { id: 'st1' },
    teacher: null,
    ...user,
  },
  ...over,
});

describe('CalendarFeedService.render', () => {
  const prisma = { calendarFeed: { findUnique: vi.fn(), updateMany: vi.fn() } };
  const builder = { build: vi.fn() };
  let service: CalendarFeedService;
  const file = (secret = SECRET) => `${feedToken(ID, secret)}.ics`;

  beforeEach(async () => {
    vi.resetAllMocks();
    builder.build.mockResolvedValue('BEGIN:VCALENDAR');
    const env: Record<string, string> = {
      JWT_REFRESH_SECRET: KEY,
      PUBLIC_WEB_URL: 'https://ecole.test',
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CalendarFeedService,
        { provide: PrismaService, useValue: prisma },
        { provide: FeedBuilderService, useValue: builder },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    service = moduleRef.get(CalendarFeedService);
  });

  it('serves the feed of a working token, built for its owner', async () => {
    prisma.calendarFeed.findUnique.mockResolvedValue(row());
    await expect(service.render(file())).resolves.toBe('BEGIN:VCALENDAR');
    expect(prisma.calendarFeed.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID } }),
    );
    expect(builder.build).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'student', studentId: 'st1', teacherId: null }),
      expect.any(Date),
    );
  });

  it('never looks a malformed token up', async () => {
    for (const bad of ['', 'x.ics', `${feedToken(ID, SECRET)}`, `${feedToken(ID, SECRET)}x.ics`])
      await expect(service.render(bad)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.calendarFeed.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown id', null],
    ['a wrong secret', row({ secretHash: hash('T'.repeat(43)) })],
    ['a disabled account', row({}, { status: 'disabled' })],
    ['an archived account', row({}, { status: 'archived' })],
    ['a password changed since', row({}, { passwordChangedAt: new Date() })],
    ['an admin account', row({}, { role: 'admin' })],
  ])('answers the same 404 for %s', async (_, found) => {
    prisma.calendarFeed.findUnique.mockResolvedValue(found);
    await expect(service.render(file())).rejects.toThrow('Agenda introuvable.');
    expect(builder.build).not.toHaveBeenCalled();
  });

  it('records the last use at most every quarter of an hour', async () => {
    prisma.calendarFeed.findUnique.mockResolvedValue(row({ lastUsedAt: new Date() }));
    await service.render(file());
    expect(prisma.calendarFeed.updateMany).not.toHaveBeenCalled();
    prisma.calendarFeed.findUnique.mockResolvedValue(
      row({ lastUsedAt: new Date(Date.now() - 3_600_000) }),
    );
    await service.render(file());
    expect(prisma.calendarFeed.updateMany).toHaveBeenCalledTimes(1);
  });
});
