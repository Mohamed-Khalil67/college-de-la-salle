import { weekday } from './calendar.js';
import {
  applyException,
  exceptionProblems,
  needsLab,
  entriesClash,
  expandTimetable,
  hoursBetween,
  occupancyEntries,
  shiftTime,
  slotDays,
  slotLabel,
  slotProblems,
  slotRunsOn,
  type SlotExceptionRule,
  type SlotRule,
  timesOverlap,
  weekParityOf,
  weeklyHours,
} from './timetable.js';

const slot = (over: Partial<SlotRule> = {}): SlotRule => ({
  id: 's1',
  target: 'bac-premiere',
  weekday: 0, // Sunday
  startTime: '08:30',
  endTime: '10:00',
  validFrom: '2026-09-06',
  validTo: '2026-10-31',
  weekParity: null,
  roomId: 'r12',
  teacherId: 't1',
  ...over,
});

const exception = (over: Partial<SlotExceptionRule>): SlotExceptionRule => ({
  id: 'e1',
  slotId: 's1',
  date: '2026-09-13',
  kind: 'cancelled',
  newDate: null,
  newStart: null,
  newEnd: null,
  newRoomId: null,
  newTeacherId: null,
  reason: '',
  ...over,
});

const days = (list: { current: { date: string } }[]) => list.map((o) => o.current.date);

describe('clock times', () => {
  it('measures and compares sessions', () => {
    expect(hoursBetween('08:30', '10:00')).toBe(1.5);
    expect(timesOverlap('08:30', '10:00', '09:59', '11:00')).toBe(true);
    // Sessions that touch do not overlap.
    expect(timesOverlap('08:30', '10:00', '10:00', '11:00')).toBe(false);
    expect(shiftTime('10:00', 60)).toBe('11:00');
    expect(shiftTime('23:30', 120)).toBe('23:59');
    expect(shiftTime('00:10', -60)).toBe('00:00');
  });

  it('counts a fortnightly slot as half its length', () => {
    expect(weeklyHours({ startTime: '08:00', endTime: '10:00', weekParity: null })).toBe(2);
    expect(weeklyHours({ startTime: '08:00', endTime: '10:00', weekParity: 'A' })).toBe(1);
  });
});

describe('week parity', () => {
  it('the week of the anchor is A, the next B, the one after A again', () => {
    expect(weekParityOf('2026-09-06', '2026-09-06')).toBe('A');
    // Same week, later day.
    expect(weekParityOf('2026-09-10', '2026-09-06')).toBe('A');
    expect(weekParityOf('2026-09-13', '2026-09-06')).toBe('B');
    expect(weekParityOf('2026-09-20', '2026-09-06')).toBe('A');
  });

  it('an anchor in the middle of a week counts that whole week (Sunday first)', () => {
    expect(weekParityOf('2026-09-06', '2026-09-09')).toBe('A');
    expect(weekParityOf('2026-09-13', '2026-09-09')).toBe('B');
  });

  it('works for days before the anchor and across the new year', () => {
    expect(weekParityOf('2026-08-30', '2026-09-06')).toBe('B');
    expect(weekParityOf('2026-08-23', '2026-09-06')).toBe('A');
    // 2026-09-06 + 17 weeks = 2027-01-03
    expect(weekParityOf('2027-01-03', '2026-09-06')).toBe('B');
    expect(weekParityOf('2027-01-10', '2026-09-06')).toBe('A');
  });
});

describe('slotDays', () => {
  it('lists every weekly day inside the valid range and the window', () => {
    expect(slotDays(slot(), '2026-09-01', '2026-09-30')).toEqual([
      '2026-09-06',
      '2026-09-13',
      '2026-09-20',
      '2026-09-27',
    ]);
    expect(slotDays(slot(), '2026-09-14', '2026-09-20')).toEqual(['2026-09-20']);
  });

  it('respects validFrom and validTo, both included', () => {
    const s = slot({ validFrom: '2026-09-13', validTo: '2026-09-20' });
    expect(slotDays(s, '2026-01-01', '2026-12-31')).toEqual(['2026-09-13', '2026-09-20']);
    expect(slotDays(s, '2026-09-21', '2026-12-31')).toEqual([]);
    expect(slotDays(s, '2026-01-01', '2026-09-12')).toEqual([]);
  });

  it('starts from a window that falls on another weekday', () => {
    // 2026-09-08 is a Tuesday: the next Sunday is the 13th.
    expect(weekday('2026-09-08')).toBe(2);
    expect(slotDays(slot(), '2026-09-08', '2026-09-14')).toEqual(['2026-09-13']);
  });

  it('keeps only the weeks of its parity', () => {
    const a = slot({ weekParity: 'A' });
    const b = slot({ weekParity: 'B' });
    const options = { parityAnchor: '2026-09-06' };
    expect(slotDays(a, '2026-09-01', '2026-10-04', options)).toEqual([
      '2026-09-06',
      '2026-09-20',
      '2026-10-04',
    ]);
    expect(slotDays(b, '2026-09-01', '2026-10-04', options)).toEqual(['2026-09-13', '2026-09-27']);
  });

  it('skips holidays and days without classes of its class, section or the whole school', () => {
    const closures = [
      { startsOn: '2026-09-13', endsOn: '2026-09-13', targets: ['all'] },
      { startsOn: '2026-09-20', endsOn: '2026-09-20', targets: ['bac'] },
      { startsOn: '2026-09-27', endsOn: '2026-09-27', targets: ['bac-premiere'] },
      // Another section and another class keep their lessons.
      { startsOn: '2026-10-04', endsOn: '2026-10-04', targets: ['nationale'] },
      { startsOn: '2026-10-11', endsOn: '2026-10-11', targets: ['bac-seconde'] },
    ];
    expect(slotDays(slot(), '2026-09-06', '2026-10-18', { closures })).toEqual([
      '2026-09-06',
      '2026-10-04',
      '2026-10-11',
      '2026-10-18',
    ]);
  });

  it('skips a whole holiday range, ends included', () => {
    const closures = [{ startsOn: '2026-09-12', endsOn: '2026-09-20', targets: ['all'] }];
    expect(slotDays(slot(), '2026-09-06', '2026-09-27', { closures })).toEqual([
      '2026-09-06',
      '2026-09-27',
    ]);
  });

  it('the weekday never drifts: Sundays stay Sundays across the clock change', () => {
    // Egypt moves its clocks in late April and late October; the engine works on days, so it cannot slip.
    const s = slot({ validFrom: '2027-04-01', validTo: '2027-05-31' });
    for (const d of slotDays(s, '2027-04-01', '2027-05-31')) expect(weekday(d)).toBe(0);
    expect(slotDays(s, '2027-04-25', '2027-05-02')).toEqual(['2027-04-25', '2027-05-02']);
    const autumn = slot({ validFrom: '2026-10-20', validTo: '2026-11-10' });
    expect(slotDays(autumn, '2026-10-20', '2026-11-10')).toEqual([
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
    ]);
  });

  it('slotRunsOn agrees with slotDays', () => {
    expect(slotRunsOn(slot(), '2026-09-06')).toBe(true);
    expect(slotRunsOn(slot(), '2026-09-07')).toBe(false);
    expect(slotRunsOn(slot(), '2026-11-01')).toBe(false);
  });
});

describe('expandTimetable', () => {
  it('marks a plain session with identical original and current values', () => {
    const [o] = expandTimetable([slot()], [], '2026-09-06', '2026-09-06');
    expect(o).toMatchObject({
      key: 's1@2026-09-06',
      status: 'normal',
      originalDate: '2026-09-06',
      exception: null,
      changes: [],
      movedTo: null,
    });
    expect(o!.current).toEqual(o!.original);
  });

  it('keeps a cancelled session, as cancelled, on its original day', () => {
    const list = expandTimetable(
      [slot()],
      [exception({ kind: 'cancelled', reason: 'Sortie' })],
      '2026-09-06',
      '2026-09-20',
    );
    expect(list.map((o) => [o.current.date, o.status])).toEqual([
      ['2026-09-06', 'normal'],
      ['2026-09-13', 'cancelled'],
      ['2026-09-20', 'normal'],
    ]);
    expect(list[1]!.exception?.reason).toBe('Sortie');
    expect(list[1]!.current).toEqual(list[1]!.original);
  });

  it('a moved session shows the new day and time, and the old day as a trace', () => {
    const ex = exception({
      kind: 'moved',
      newDate: '2026-09-15',
      newStart: '14:00',
      newEnd: '15:30',
    });
    const list = expandTimetable([slot()], [ex], '2026-09-13', '2026-09-19');
    expect(list.map((o) => [o.current.date, o.status])).toEqual([
      ['2026-09-13', 'moved_from'],
      ['2026-09-15', 'moved'],
    ]);
    const moved = list[1]!;
    expect(moved.current).toMatchObject({ date: '2026-09-15', startTime: '14:00', endTime: '15:30' });
    expect(moved.original).toMatchObject({ date: '2026-09-13', startTime: '08:30', endTime: '10:00' });
    expect(moved.changes).toEqual(['date', 'time']);
    expect(list[0]!.movedTo).toMatchObject({ date: '2026-09-15', startTime: '14:00' });
    expect(list[0]!.key).toBe('s1@2026-09-13:from');
  });

  it('a session moved to another week appears in both weeks', () => {
    const ex = exception({ kind: 'moved', newDate: '2026-09-22' });
    // The week of the original day shows the trace; the week of the new day shows the session.
    const before = expandTimetable([slot()], [ex], '2026-09-13', '2026-09-19');
    expect(before.map((o) => o.status)).toEqual(['moved_from']);
    const after = expandTimetable([slot()], [ex], '2026-09-20', '2026-09-26');
    expect(after.map((o) => [o.current.date, o.status])).toEqual([
      ['2026-09-20', 'normal'],
      ['2026-09-22', 'moved'],
    ]);
    expect(after[1]!.originalDate).toBe('2026-09-13');
  });

  it('a move within the day has no trace and keeps the room', () => {
    const ex = exception({ kind: 'moved', newStart: '10:15' });
    const list = expandTimetable([slot()], [ex], '2026-09-13', '2026-09-13');
    expect(list).toHaveLength(1);
    // A new start without an end keeps the 1h30 length.
    expect(list[0]!.current).toMatchObject({ startTime: '10:15', endTime: '11:45', roomId: 'r12' });
    expect(list[0]!.changes).toEqual(['time']);
  });

  it('a substitute keeps day and time and changes the teacher', () => {
    const ex = exception({ kind: 'substitute', newTeacherId: 't2' });
    const [o] = expandTimetable([slot()], [ex], '2026-09-13', '2026-09-13');
    expect(o).toMatchObject({ status: 'substitute', changes: ['teacher'] });
    expect(o!.current.teacherId).toBe('t2');
    expect(o!.original.teacherId).toBe('t1');
  });

  it('a room change keeps day and time and changes the room', () => {
    const ex = exception({ kind: 'room_change', newRoomId: 'lab' });
    const [o] = expandTimetable([slot()], [ex], '2026-09-13', '2026-09-13');
    expect(o).toMatchObject({ status: 'room_change', changes: ['room'] });
    expect(o!.current.roomId).toBe('lab');
    expect(o!.original.roomId).toBe('r12');
  });

  it('a session on a holiday does not exist, even with an exception', () => {
    const closures = [{ startsOn: '2026-09-13', endsOn: '2026-09-13', targets: ['all'] }];
    const list = expandTimetable(
      [slot()],
      [exception({ kind: 'room_change', newRoomId: 'lab' })],
      '2026-09-06',
      '2026-09-20',
      { closures },
    );
    expect(days(list)).toEqual(['2026-09-06', '2026-09-20']);
  });

  it('ignores an exception outside the valid range of the rule', () => {
    const ex = exception({ date: '2026-12-06', kind: 'cancelled' });
    expect(expandTimetable([slot()], [ex], '2026-12-01', '2026-12-31')).toEqual([]);
  });

  it('ignores an exception whose date is not a session of the rule (wrong weekday)', () => {
    const ex = exception({ date: '2026-09-14', kind: 'cancelled' });
    const list = expandTimetable([slot()], [ex], '2026-09-06', '2026-09-20');
    expect(list.every((o) => o.status === 'normal')).toBe(true);
  });

  it('expands several slots and sorts by day, then start time', () => {
    const early = slot({ id: 'early', startTime: '08:00', endTime: '09:00' });
    const late = slot({ id: 'late', startTime: '13:00', endTime: '14:00' });
    const other = slot({ id: 'mon', weekday: 1, startTime: '07:00', endTime: '08:00' });
    const list = expandTimetable([late, other, early], [], '2026-09-06', '2026-09-07');
    expect(list.map((o) => o.slot.id)).toEqual(['early', 'late', 'mon']);
  });

  it('a fortnightly slot with a holiday keeps the rhythm of the other weeks', () => {
    const closures = [{ startsOn: '2026-09-20', endsOn: '2026-09-26', targets: ['all'] }];
    const a = slot({ weekParity: 'A' });
    const list = expandTimetable([a], [], '2026-09-06', '2026-10-11', {
      closures,
      parityAnchor: '2026-09-06',
    });
    // Week A: 6 Sep, 20 Sep (closed), 4 Oct.
    expect(days(list)).toEqual(['2026-09-06', '2026-10-04']);
  });

  it('applyException keeps the original values for a cancellation', () => {
    expect(applyException(slot(), exception({ kind: 'cancelled' }))).toEqual({
      date: '2026-09-13',
      startTime: '08:30',
      endTime: '10:00',
      roomId: 'r12',
      teacherId: 't1',
    });
  });
});

describe('occupancy index', () => {
  it('holds the room, teacher and class of every standing session, none for cancelled ones', () => {
    const list = expandTimetable(
      [slot()],
      [exception({ kind: 'cancelled' }), exception({ id: 'e2', date: '2026-09-20', kind: 'moved', newDate: '2026-09-21' })],
      '2026-09-06',
      '2026-09-27',
    );
    const rows = occupancyEntries(list, 'c1', null);
    // 6 Sep normal, 13 Sep cancelled (none), 20 Sep moved away (trace: none) + moved to 21 Sep, 27 Sep normal.
    expect(rows.map((r) => r.startsAt)).toEqual([
      '2026-09-06 08:30',
      '2026-09-21 08:30',
      '2026-09-27 08:30',
    ]);
    expect(rows[1]).toMatchObject({ source: 'exception', exceptionId: 'e2', classId: 'c1', roomId: 'r12', teacherId: 't1' });
    expect(rows[0]).toMatchObject({ source: 'slot', exceptionId: null });
  });

  it('flags room, teacher and class clashes, with the division exception for the class', () => {
    const base = {
      source: 'slot' as const,
      day: '2026-09-06',
      exceptionId: null,
      startsAt: '2026-09-06 08:30',
      endsAt: '2026-09-06 10:00',
    };
    const a = { ...base, roomId: 'r1', teacherId: 't1', classId: 'c1', divisionKey: null };
    const sameRoom = { ...a, teacherId: 't2', classId: 'c2' };
    expect(entriesClash(a, sameRoom)).toEqual(['room']);
    const sameTeacher = { ...a, roomId: 'r2', classId: 'c2' };
    expect(entriesClash(a, sameTeacher)).toEqual(['teacher']);
    const sameClass = { ...a, roomId: 'r2', teacherId: 't2' };
    expect(entriesClash(a, sameClass)).toEqual(['class']);
    // Touching ranges are fine.
    expect(entriesClash(a, { ...a, startsAt: '2026-09-06 10:00', endsAt: '2026-09-06 11:00' })).toEqual([]);
    // No resource, no clash.
    expect(
      entriesClash(
        { ...a, roomId: null, teacherId: null, classId: null },
        { ...a, roomId: null, teacherId: null, classId: null },
      ),
    ).toEqual([]);

    // Groups of one division share the class, but not the room or the teacher.
    const tpA = { ...a, divisionKey: 'TP', roomId: 'lab1', teacherId: 't1' };
    const tpB = { ...a, divisionKey: 'TP', roomId: 'lab2', teacherId: 't2' };
    expect(entriesClash(tpA, tpB)).toEqual([]);
    expect(entriesClash(tpA, { ...tpB, roomId: 'lab1' })).toEqual(['room']);
    // Another division, or the whole class, still clashes with a group.
    expect(entriesClash(tpA, { ...tpB, divisionKey: 'LV2' })).toEqual(['class']);
    expect(entriesClash(tpA, { ...tpB, divisionKey: null })).toEqual(['class']);
    expect(entriesClash({ ...tpA, divisionKey: null }, tpB)).toEqual(['class']);
  });
});

describe('validation helpers', () => {
  it('reports the problems of a slot in French', () => {
    const ok = { weekday: 0, startTime: '08:00', endTime: '09:00', validFrom: '2026-09-06', validTo: '2027-06-17' };
    expect(slotProblems(ok)).toEqual([]);
    expect(slotProblems({ ...ok, endTime: '08:00' })).toEqual(['La fin doit suivre le début.']);
    expect(slotProblems({ ...ok, validTo: '2026-09-05' })).toEqual([
      'La fin de validité ne peut pas précéder le début.',
    ]);
    expect(slotProblems({ ...ok, weekday: 7 })).toHaveLength(1);
    expect(slotProblems({ ...ok, validTo: '2028-01-01' })).toEqual(['Une série ne peut pas dépasser une année.']);
  });

  it('labels a slot', () => {
    expect(slotLabel({ weekday: 0, startTime: '08:30', endTime: '10:00' })).toBe('Dimanche 08:30 – 10:00');
  });
});

describe('exceptions and lab rule', () => {
  it('checks what each kind of exception carries', () => {
    expect(exceptionProblems({ kind: 'cancelled' })).toEqual([]);
    expect(exceptionProblems({ kind: 'cancelled', newRoomId: 'r' })).toHaveLength(1);
    expect(exceptionProblems({ kind: 'moved' })).toEqual(['Indiquez le nouveau jour ou la nouvelle heure.']);
    expect(exceptionProblems({ kind: 'moved', newDate: '2026-09-15' })).toEqual([]);
    expect(exceptionProblems({ kind: 'moved', newStart: '09:00' })).toEqual([
      'Indiquez l’heure de début et l’heure de fin.',
    ]);
    expect(exceptionProblems({ kind: 'moved', newStart: '10:00', newEnd: '09:00' })).toEqual([
      'La fin doit suivre le début.',
    ]);
    expect(exceptionProblems({ kind: 'substitute' })).toHaveLength(1);
    expect(exceptionProblems({ kind: 'substitute', newTeacherId: 't' })).toEqual([]);
    expect(exceptionProblems({ kind: 'room_change' })).toHaveLength(1);
    expect(exceptionProblems({ kind: 'room_change', newRoomId: 'r', newDate: '2026-09-15' })).toHaveLength(1);
  });

  it('only the system TP belongs in a laboratory', () => {
    expect(needsLab({ isSystem: true, code: 'tp' })).toBe(true);
    expect(needsLab({ isSystem: true, code: 'cours' })).toBe(false);
    expect(needsLab({ isSystem: false, code: 'tp' })).toBe(false);
  });
});
