import { Test } from '@nestjs/testing';
import type { TimetableConflictDto } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { type IndexRow, OccupancyService } from '../occupancy/occupancy.service.js';
import { TimetableSuggestionsService } from './suggestions.service.js';

const row = (over: Partial<IndexRow> = {}): IndexRow => ({
  source: 'slot',
  day: '2027-09-08',
  roomId: 'r1',
  teacherId: 't1',
  classId: 'c1',
  divisionKey: null,
  groupId: null,
  startsAt: '2027-09-08 08:00',
  endsAt: '2027-09-08 09:00',
  exceptionId: null,
  slotId: 's1',
  eventId: null,
  ...over,
});
const conflict = (kind: TimetableConflictDto['kind']) => ({ kind }) as TimetableConflictDto;

const slotRow = {
  id: 's1',
  roomId: 'r1',
  groupId: null,
  weekday: 3,
  startTime: '08:00',
  endTime: '09:00',
  validFrom: new Date('2027-09-05T00:00:00Z'),
  validTo: new Date('2027-12-20T00:00:00Z'),
  weekParity: null,
  teacherId: 't1',
  division: null,
  exceptions: [],
  activityType: { isSystem: true, code: 'cours' },
  classSubject: {
    classId: 'c1',
    schoolClass: {
      id: 'c1',
      code: 'premiere',
      schoolYearId: 'y1',
      section: { code: 'bac' },
      schoolYear: { startsOn: new Date('2027-09-05T00:00:00Z') },
    },
  },
};

describe('TimetableSuggestionsService (which queries run for which conflict)', () => {
  const occupancy = { roomsFreeDuring: vi.fn(), clashingCandidates: vi.fn() };
  const tx = {
    timetableSlot: { findUnique: vi.fn(), findMany: vi.fn() },
    room: { findUnique: vi.fn() },
    enrollment: { count: vi.fn() },
    groupMember: { count: vi.fn() },
    calendarDay: { findMany: vi.fn() },
  };
  const db = tx as unknown as Prisma.TransactionClient;
  let service: TimetableSuggestionsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    tx.timetableSlot.findUnique.mockResolvedValue(slotRow);
    tx.timetableSlot.findMany.mockResolvedValue([
      { startTime: '08:00', endTime: '09:00' },
      { startTime: '09:00', endTime: '10:00' },
    ]);
    tx.room.findUnique.mockResolvedValue({ id: 'r1', kind: 'classroom' });
    tx.enrollment.count.mockResolvedValue(20);
    tx.calendarDay.findMany.mockResolvedValue([]);
    occupancy.roomsFreeDuring.mockResolvedValue([
      { id: 'r1', name: 'Salle 1', capacity: 30, kind: 'classroom' },
      { id: 'r2', name: 'Salle 2', capacity: 30, kind: 'classroom' },
      { id: 'r3', name: 'Petite', capacity: 10, kind: 'classroom' },
    ]);
    occupancy.clashingCandidates.mockResolvedValue(new Set());
    const moduleRef = await Test.createTestingModule({
      providers: [TimetableSuggestionsService, { provide: OccupancyService, useValue: occupancy }],
    }).compile();
    service = moduleRef.get(TimetableSuggestionsService);
  });

  it('a room change into a taken room: rooms that seat the class, never the one asked for, no times', async () => {
    const out = await service.forConflicts(
      db,
      { target: 'session', slotId: 's1', date: '2027-09-08', change: 'room_change' },
      [row({ roomId: 'r9' })],
      [conflict('room')],
    );
    expect(out.map((s) => s.kind === 'room' && s.roomId)).toEqual(['r2']);
    expect(occupancy.clashingCandidates).not.toHaveBeenCalled();
  });

  it('a busy teacher: no rooms (they would not help), times checked in ONE query', async () => {
    const out = await service.forConflicts(
      db,
      { target: 'session', slotId: 's1', date: '2027-09-08', change: 'moved' },
      [row()],
      [conflict('teacher')],
    );
    expect(occupancy.roomsFreeDuring).not.toHaveBeenCalled();
    expect(occupancy.clashingCandidates).toHaveBeenCalledTimes(1);
    expect(out.every((s) => s.kind === 'time')).toBe(true);
    expect(out[0]).toMatchObject({ target: 'session', date: '2027-09-08', startTime: '09:00' });
  });

  it('a candidate the index reports as taken is left out', async () => {
    occupancy.clashingCandidates.mockResolvedValue(new Set([0]));
    const out = await service.forConflicts(
      db,
      { target: 'session', slotId: 's1', date: '2027-09-08', change: 'moved' },
      [row()],
      [conflict('class')],
    );
    expect(
      out.some((s) => s.kind === 'time' && s.date === '2027-09-08' && s.startTime === '09:00'),
    ).toBe(false);
  });

  it('nothing to suggest when the clashing rows are not the ones the write placed', async () => {
    const out = await service.forConflicts(
      db,
      { target: 'series', slotId: 'other' },
      [row()],
      [conflict('room')],
    );
    expect(out).toEqual([]);
    expect(tx.timetableSlot.findUnique).not.toHaveBeenCalled();
  });
});
