import type { Prisma } from '../generated/prisma/client.js';
import type { TargetsService } from '../targets/targets.service.js';
import { ChangeNoticesService, type SessionNotice } from './change-notices.service.js';
import type { NotificationDraft, NotificationsService } from './notifications.service.js';

type Db = Prisma.TransactionClient;

const slot = (id: string, over: { groupId?: string | null; classId: string; teacherUser: string }) => ({
  id,
  groupId: over.groupId ?? null,
  group: over.groupId ? { label: 'Groupe A' } : null,
  startTime: '08:00',
  endTime: '08:45',
  teacher: { userId: over.teacherUser },
  classSubject: { classId: over.classId, subject: { name: 'Mathématiques' }, schoolClass: { label: '1re Bac' } },
});

/** A transaction that records every query it is asked, with a small school behind it. */
function fakeTx(slots: ReturnType<typeof slot>[]) {
  const calls: string[] = [];
  const tx = {
    timetableSlot: {
      findMany: vi.fn((args: { where: { id: { in: string[] } } }) => {
        calls.push('slot.findMany');
        return Promise.resolve(slots.filter((s) => args.where.id.in.includes(s.id)));
      }),
    },
    room: {
      findMany: vi.fn(() => {
        calls.push('room.findMany');
        return Promise.resolve([{ id: 'room-2', name: 'Salle 12' }]);
      }),
    },
    teacher: {
      findMany: vi.fn(() => {
        calls.push('teacher.findMany');
        return Promise.resolve([
          { id: 'cover-1', userId: 'u-cover', user: { firstName: 'Ana', lastName: 'Lopez' } },
          { id: 'sub-1', userId: 'u-sub', user: { firstName: 'Bo', lastName: 'Li' } },
        ]);
      }),
    },
    groupMember: {
      findMany: vi.fn(() => {
        calls.push('groupMember.findMany');
        return Promise.resolve([
          { groupId: 'g1', student: { userId: 'u-g1-a' } },
          { groupId: 'g1', student: { userId: 'u-g1-b' } },
        ]);
      }),
    },
    enrollment: {
      findMany: vi.fn(() => {
        calls.push('enrollment.findMany');
        return Promise.resolve([
          { classId: 'c1', student: { userId: 'u-c1-a' } },
          { classId: 'c1', student: { userId: 'u-c1-b' } },
          { classId: 'c2', student: { userId: 'u-c2-a' } },
        ]);
      }),
    },
  };
  return { tx: tx as unknown as Db, calls };
}

function service() {
  const written: NotificationDraft[][] = [];
  const notifications = {
    write: vi.fn((_tx: Db, drafts: NotificationDraft[]) => {
      written.push(drafts);
      return Promise.resolve(drafts.length);
    }),
  };
  return {
    written,
    svc: new ChangeNoticesService(notifications as unknown as NotificationsService, {} as TargetsService),
  };
}

describe('ChangeNoticesService.sessions', () => {
  it('asks a fixed handful of queries for any number of notices (no query per notice)', async () => {
    const slots = Array.from({ length: 60 }, (_, i) =>
      slot(`s${i}`, { classId: i % 2 ? 'c1' : 'c2', teacherUser: 'u-teacher' }),
    );
    const notices: SessionNotice[] = slots.map((s) => ({
      kind: 'session_substituted',
      slotId: s.id,
      date: '2026-11-01',
      coverTeacherId: 'cover-1',
      substituteTeacherId: 'sub-1',
      newRoomId: 'room-2',
    }));
    const { tx, calls } = fakeTx(slots);
    const { svc, written } = service();

    await svc.sessions(tx, notices, 'actor');

    expect(calls.length).toBeLessThanOrEqual(5);
    expect(new Set(calls)).toEqual(
      new Set(['slot.findMany', 'room.findMany', 'teacher.findMany', 'enrollment.findMany']),
    );
    expect(written[0]).toHaveLength(60);
  });

  it('keeps who is told: the students of the class or group, the teacher, the substitute and the cover', async () => {
    const slots = [
      slot('whole', { classId: 'c1', teacherUser: 'u-t1' }),
      slot('grouped', { classId: 'c1', groupId: 'g1', teacherUser: 'u-t2' }),
    ];
    const { tx } = fakeTx(slots);
    const { svc, written } = service();

    await svc.sessions(
      tx,
      [
        { kind: 'session_substituted', slotId: 'whole', date: '2026-11-01', coverTeacherId: 'cover-1', substituteTeacherId: 'sub-1' },
        { kind: 'session_cancelled', slotId: 'grouped', date: '2026-11-02' },
        { kind: 'session_cancelled', slotId: 'gone', date: '2026-11-03' },
      ],
      null,
    );

    const [whole, grouped] = written[0]!;
    expect(written[0]).toHaveLength(2);
    expect(whole!.recipients.map((r) => r.userId)).toEqual(['u-c1-a', 'u-c1-b', 'u-t1', 'u-sub', 'u-cover']);
    expect(grouped!.recipients.map((r) => r.userId)).toEqual(['u-g1-a', 'u-g1-b', 'u-t2']);
    expect(whole!.entityId).toBe('whole@2026-11-01');
    expect(whole!.text('teacher')).toMatchObject({ body: expect.stringContaining('Ana Lopez') as string });
  });

  it('writes nothing and runs no query for an empty list', async () => {
    const { tx, calls } = fakeTx([]);
    const { svc } = service();
    await svc.sessions(tx, [], null);
    expect(calls).toEqual([]);
  });
});
