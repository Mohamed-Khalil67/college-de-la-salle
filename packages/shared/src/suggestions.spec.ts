import { describe, expect, it } from 'vitest';
import {
  compatibleRoomKinds,
  periodTimes,
  rankRooms,
  type RoomCandidate,
  roomSuggestion,
  seriesCandidates,
  sessionCandidates,
  timeSuggestion,
} from './suggestions.js';
import { schoolTimeNow } from './timetable.js';

// The seed's periods: two breaks (10:00 – 10:15, 12:15 – 12:45).
const PERIODS = [
  ['08:00', '09:00'],
  ['09:00', '10:00'],
  ['10:15', '11:15'],
  ['11:15', '12:15'],
  ['12:45', '13:45'],
  ['13:45', '14:45'],
  ['14:45', '15:45'],
].map(([startTime, endTime]) => ({ startTime: startTime!, endTime: endTime! }));
const WEEK = [0, 1, 2, 3, 4];

describe('periodTimes', () => {
  it('keeps one-hour sessions on the periods', () => {
    expect(periodTimes(PERIODS, 60)).toEqual(PERIODS);
  });

  it('never lets a two-hour block straddle a break', () => {
    expect(periodTimes(PERIODS, 120).map((t) => `${t.startTime}-${t.endTime}`)).toEqual([
      '08:00-10:00',
      '10:15-12:15',
      '12:45-14:45',
      '13:45-15:45',
    ]);
  });

  it('falls back to the period starts when the length fits no pair of periods', () => {
    const times = periodTimes(PERIODS, 90);
    expect(times[0]).toEqual({ startTime: '08:00', endTime: '09:30' });
    expect(times.every((t) => PERIODS.some((p) => p.startTime === t.startTime))).toBe(true);
    // 14:45 + 1 h 30 still ends inside the school day (17:00).
    expect(times.at(-1)).toEqual({ startTime: '14:45', endTime: '16:15' });
  });

  it('steps every half hour inside the school day without a timetable', () => {
    const times = periodTimes([], 60, { start: '08:00', end: '10:00' });
    expect(times).toEqual([
      { startTime: '08:00', endTime: '09:00' },
      { startTime: '08:30', endTime: '09:30' },
      { startTime: '09:00', endTime: '10:00' },
    ]);
  });

  it('drops periods outside the school day', () => {
    const late = [...PERIODS, { startTime: '17:00', endTime: '18:00' }];
    expect(periodTimes(late, 60)).toEqual(PERIODS);
  });
});

describe('sessionCandidates', () => {
  // Tuesday 3 November 2026; its week runs Sunday 1 to Thursday 5.
  const wanted = { date: '2026-11-03', startTime: '10:15', endTime: '11:15' };
  const open = () => true;
  const base = { weekdays: WEEK, times: PERIODS, today: '2026-11-01', now: '07:00', isOpen: open };

  it('ranks the same day first, nearest time first, and leaves the wanted place out', () => {
    const list = sessionCandidates(wanted, base);
    // 11:15 is one hour away, 09:00 an hour and a quarter, 08:00 two and a quarter.
    expect(list.slice(0, 3)).toEqual([
      { date: '2026-11-03', startTime: '11:15', endTime: '12:15' },
      { date: '2026-11-03', startTime: '09:00', endTime: '10:00' },
      { date: '2026-11-03', startTime: '08:00', endTime: '09:00' },
    ]);
    expect(list.some((p) => p.date === wanted.date && p.startTime === wanted.startTime)).toBe(
      false,
    );
    // Then the neighbouring days at the same time, the earlier day first.
    const otherDays = list.filter((p) => p.date !== wanted.date);
    expect(otherDays.slice(0, 2).map((p) => p.date)).toEqual(['2026-11-02', '2026-11-04']);
  });

  it('stays in the week and on school days', () => {
    const days = new Set(sessionCandidates(wanted, base).map((p) => p.date));
    expect([...days].sort()).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
  });

  it('suggests nothing before today, nor earlier than now today', () => {
    const list = sessionCandidates(wanted, { ...base, today: '2026-11-03', now: '12:00' });
    expect(list.every((p) => p.date >= '2026-11-03')).toBe(true);
    expect(list.filter((p) => p.date === '2026-11-03').every((p) => p.startTime >= '12:00')).toBe(
      true,
    );
  });

  it('skips the days the class has no classes', () => {
    const list = sessionCandidates(wanted, { ...base, isOpen: (d) => d !== '2026-11-04' });
    expect(list.some((p) => p.date === '2026-11-04')).toBe(false);
  });
});

describe('seriesCandidates', () => {
  it('ranks the same weekday first, then the nearest weekdays', () => {
    const list = seriesCandidates(
      { weekday: 2, startTime: '08:00', endTime: '09:00' },
      { weekdays: WEEK, times: PERIODS },
    );
    expect(list[0]).toEqual({ weekday: 2, startTime: '09:00', endTime: '10:00' });
    expect(list.filter((p) => p.weekday === 2)).toHaveLength(PERIODS.length - 1);
    expect(list[PERIODS.length - 1]).toEqual({ weekday: 1, startTime: '08:00', endTime: '09:00' });
    expect(list[PERIODS.length]).toEqual({ weekday: 3, startTime: '08:00', endTime: '09:00' });
  });
});

describe('rooms', () => {
  const rooms: RoomCandidate[] = [
    { id: 'big', name: 'Salle 20', capacity: 40, kind: 'classroom' },
    { id: 'fit', name: 'Salle 12', capacity: 30, kind: 'classroom' },
    { id: 'small', name: 'Salle 3', capacity: 18, kind: 'classroom' },
    { id: 'unknown', name: 'Salle 1', capacity: null, kind: 'classroom' },
    { id: 'lab', name: 'Laboratoire', capacity: 30, kind: 'lab' },
  ];

  it('keeps the rooms that seat the class, the snuggest first, unknown capacity last', () => {
    expect(rankRooms(rooms, { seats: 28, kinds: ['classroom'] }).map((r) => r.id)).toEqual([
      'fit',
      'big',
      'unknown',
    ]);
  });

  it('asks a laboratory for a TP and keeps the kind of the room asked for otherwise', () => {
    expect(compatibleRoomKinds({ lab: true, requestedKind: 'classroom' })).toEqual(['lab']);
    expect(compatibleRoomKinds({ lab: false, requestedKind: 'gym' })).toEqual(['gym']);
    expect(compatibleRoomKinds({ lab: false, requestedKind: null })).toEqual(['classroom']);
    expect(rankRooms(rooms, { seats: 10, kinds: ['lab'] }).map((r) => r.id)).toEqual(['lab']);
  });

  it('labels a room with its seats', () => {
    expect(roomSuggestion('session', rooms[1]!).label).toBe('Salle 12 (30 places)');
    expect(roomSuggestion('series', rooms[3]!).label).toBe('Salle 1');
  });
});

describe('labels', () => {
  it('names a session by its day and a series by its weekday', () => {
    expect(
      timeSuggestion({ date: '2026-11-03', startTime: '10:15', endTime: '11:15' }),
    ).toMatchObject({
      target: 'session',
      weekday: 2,
      label: 'mardi 3 novembre, 10:15 – 11:15',
    });
    expect(timeSuggestion({ weekday: 0, startTime: '08:00', endTime: '09:00' })).toMatchObject({
      target: 'series',
      date: null,
      label: 'le dimanche, 08:00 – 09:00',
    });
  });

  it('reads the clock in Cairo', () => {
    // 06:30 UTC is 09:30 in Cairo in summer time (UTC+3).
    expect(schoolTimeNow(new Date('2026-07-01T06:30:00Z'))).toBe('09:30');
  });
});
