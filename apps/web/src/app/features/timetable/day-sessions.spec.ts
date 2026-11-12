import type { CalendarDayDto, TimetableOccurrenceDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { closedDayOf, minutesOf, phaseOf, sessionsOfDay } from './day-sessions';

// 2026-11-10 is a Tuesday.
const TODAY = '2026-11-10';

function session(start: string, end: string, extra: Partial<TimetableOccurrenceDto> = {}): TimetableOccurrenceDto {
  const values = { date: TODAY, startTime: start, endTime: end, roomId: 'r1', roomName: 'Salle 12', teacherId: 't1', teacherName: 'Hany Mansour' };
  return {
    key: `slot-${start}@${TODAY}`,
    slotId: `slot-${start}`,
    originalDate: TODAY,
    status: 'normal',
    current: values,
    original: values,
    changes: [],
    movedTo: null,
    exceptionId: null,
    reason: '',
    classId: 'c1',
    classLabel: 'Seconde B',
    subjectId: 'maths',
    subjectName: 'Mathématiques',
    activityType: { id: 'a1', code: 'cours', label: 'Cours', colour: 'navy', icon: 'book', gradable: false, repeatable: true, homework: false },
    division: null,
    groupId: null,
    groupLabel: null,
    canChange: false,
    ...extra,
  };
}

const holiday: CalendarDayDto = {
  id: 'h1',
  schoolYearId: 'y1',
  type: 'holiday',
  label: 'Vacances d’automne',
  startsOn: '2026-11-08',
  endsOn: '2026-11-12',
  sectionId: null,
  classIds: [],
};

describe('minutesOf', () => {
  it('turns HH:MM into minutes', () => {
    expect(minutesOf('08:30')).toBe(510);
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('23:59')).toBe(1439);
  });
});

describe('phaseOf', () => {
  const s = session('09:00', '10:00');
  it('is upcoming before the start, current up to the end, past from the end', () => {
    expect(phaseOf(s, '08:59')).toBe('upcoming');
    expect(phaseOf(s, '09:00')).toBe('current');
    expect(phaseOf(s, '09:59')).toBe('current');
    expect(phaseOf(s, '10:00')).toBe('past');
  });
  it('reads a moved-away session at its old time', () => {
    const away = session('09:00', '10:00', {
      status: 'moved_from',
      current: { ...s.current, startTime: '14:00', endTime: '15:00' },
    });
    expect(phaseOf(away, '10:30')).toBe('past');
  });
});

describe('sessionsOfDay', () => {
  it('keeps the day, in start order, and ignores other days', () => {
    const other = session('07:00', '08:00', { current: { ...session('07:00', '08:00').current, date: '2026-11-11' } });
    const list = [session('10:15', '11:15'), other, session('08:00', '09:00')];
    expect(sessionsOfDay(list, TODAY).map((o) => o.current.startTime)).toEqual(['08:00', '10:15']);
  });
  it('keeps a moved-away session at its old place in the row', () => {
    const base = session('09:00', '10:00');
    const away = { ...base, status: 'moved_from' as const, current: { ...base.current, date: '2026-11-12' } };
    expect(sessionsOfDay([away], TODAY)).toHaveLength(1);
    expect(sessionsOfDay([away], '2026-11-12')).toHaveLength(0);
  });
});

describe('closedDayOf', () => {
  it('finds a holiday covering today, not an exam week', () => {
    expect(closedDayOf([holiday], TODAY)).toBe(holiday);
    expect(closedDayOf([{ ...holiday, type: 'exam_week' }], TODAY)).toBeNull();
    expect(closedDayOf([holiday], '2026-11-20')).toBeNull();
  });
});
