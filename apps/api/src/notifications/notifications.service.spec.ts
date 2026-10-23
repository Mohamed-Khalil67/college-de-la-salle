import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { addDays, schoolToday } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type NotificationDraft, NotificationsService } from './notifications.service.js';

const USER = { id: 'u-student' } as AuthUser;

const draft = (over: Partial<NotificationDraft> = {}): NotificationDraft => ({
  kind: 'session_cancelled',
  recipients: [
    { userId: 'u-student', role: 'student' },
    { userId: 'u-teacher', role: 'teacher' },
  ],
  text: (role) => ({ title: `Titre ${role}`, body: `Corps ${role}` }),
  topic: 'timetable',
  occursOn: addDays(schoolToday(), 3),
  entity: 'timetable_slot',
  entityId: 's1@2026-11-03',
  ...over,
});

describe('NotificationsService', () => {
  const tx = {
    user: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
  };
  const prisma = {
    notification: { updateMany: vi.fn(), findFirst: vi.fn() },
  };
  let service: NotificationsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    tx.user.findMany.mockResolvedValue([
      { id: 'u-student', notifyByEmail: true },
      { id: 'u-teacher', notifyByEmail: false },
    ]);
    tx.notification.createMany.mockImplementation(({ data }: { data: unknown[] }) =>
      Promise.resolve({ count: data.length }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  const rows = () =>
    (tx.notification.createMany.mock.calls[0]![0] as { data: Record<string, unknown>[] }).data;

  it('writes one row per recipient, with the text and the link of their role', async () => {
    expect(await service.write(tx as never, [draft()], null)).toBe(2);
    expect(rows()).toEqual([
      expect.objectContaining({
        userId: 'u-student',
        title: 'Titre student',
        link: '/eleve/emploi-du-temps',
        mailState: 'pending',
      }),
      expect.objectContaining({
        userId: 'u-teacher',
        title: 'Titre teacher',
        link: '/enseignant/emploi-du-temps',
        mailState: 'none',
      }),
    ]);
  });

  it('never notifies the actor, nor twice the same person, nor inactive accounts', async () => {
    tx.user.findMany.mockResolvedValue([{ id: 'u-student', notifyByEmail: false }]);
    await service.write(
      tx as never,
      [
        draft({
          recipients: [
            { userId: 'u-student', role: 'student' },
            { userId: 'u-student', role: 'student' },
            { userId: 'u-teacher', role: 'teacher' },
            { userId: 'u-disabled', role: 'student' },
          ],
        }),
      ],
      'u-teacher',
    );
    // Only active accounts are asked for (the query filters on status).
    expect(tx.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) }),
    );
    expect(rows().map((r) => r['userId'])).toEqual(['u-student']);
  });

  it('queues no e-mail for a day already past', async () => {
    await service.write(tx as never, [draft({ occursOn: addDays(schoolToday(), -1) })], null);
    expect(rows()[0]).toMatchObject({ mailState: 'none' });
  });

  it('writes nothing when nobody is left', async () => {
    expect(await service.write(tx as never, [draft({ recipients: [] })], null)).toBe(0);
    expect(tx.user.findMany).not.toHaveBeenCalled();
  });

  it('marks only the user’s own notification, and 404s for anyone else’s', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead(USER, 'n1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'u-student', readAt: null },
      data: { readAt: expect.any(Date) as Date },
    });
  });
});
