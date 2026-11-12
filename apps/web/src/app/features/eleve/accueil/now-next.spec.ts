import type { CalendarDayDto, TimetableOccurrenceDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import {
  closedDayOf,
  dayStrip,
  minutesOf,
  nowLead,
  nowState,
  phaseOf,
  placeLine,
  quietText,
  untilLabel,
} from './now-next';

// 2026-11-10 is a Tuesday; 2026-11-13 a Friday.
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
    activityType: { id: 'a1', code: 'cours', label: 'Cours', colour: '', icon: '', gradable: false, repeatable: true, homework: false },
    division: null,
    groupId: null,
    groupLabel: null,
    canChange: false,
    ...extra,
  };
}

const DAY = [session('08:00', '09:00'), session('09:00', '10:00'), session('10:15', '11:15')];

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

describe('minutesOf and untilLabel', () => {
  it('turns HH:MM into minutes', () => {
    expect(minutesOf('08:30')).toBe(510);
    expect(minutesOf('00:00')).toBe(0);
  });
  it('says how long until the next class', () => {
    expect(untilLabel(12)).toBe('dans 12 min');
    expect(untilLabel(60)).toBe('dans 1 h');
    expect(untilLabel(65)).toBe('dans 1 h 05');
    expect(untilLabel(0)).toBe('maintenant');
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
});

describe('nowState', () => {
  it('shows the class in progress', () => {
    const state = nowState(DAY, TODAY, '09:20');
    expect(state.kind).toBe('current');
    expect(state.kind === 'current' && state.session.current.startTime).toBe('09:00');
    expect(nowLead(state)).toBe('En cours · fin à 10 h 00');
  });

  it('shows the next class between two classes, with the minutes left', () => {
    const state = nowState(DAY, TODAY, '10:03');
    expect(state).toMatchObject({ kind: 'next', minutesUntil: 12 });
    expect(nowLead(state)).toBe('Prochain cours · dans 12 min');
  });

  it('shows the first class before the day starts', () => {
    expect(nowState(DAY, TODAY, '07:00')).toMatchObject({ kind: 'next', minutesUntil: 60 });
  });

  it('never counts a cancelled or moved-away session as current or next', () => {
    const list = [session('08:00', '09:00', { status: 'cancelled' }), session('09:00', '10:00', { status: 'moved_from' }), session('10:15', '11:15')];
    expect(nowState(list, TODAY, '08:30')).toMatchObject({ kind: 'next', minutesUntil: 105 });
  });

  it('counts a substitute or a room change as a held class', () => {
    const list = [session('08:00', '09:00', { status: 'substitute' })];
    expect(nowState(list, TODAY, '08:30').kind).toBe('current');
  });

  it('says the day is over after the last class', () => {
    const state = nowState(DAY, TODAY, '16:00');
    expect(state).toEqual({ kind: 'quiet', reason: 'over', label: '' });
    expect(nowLead(state)).toBe('Journée terminée');
  });

  it('says the day is over when every class left was cancelled', () => {
    const list = [session('08:00', '09:00'), session('15:00', '16:00', { status: 'cancelled' })];
    expect(nowState(list, TODAY, '10:00')).toMatchObject({ kind: 'quiet', reason: 'over' });
  });

  it('names the holiday when the school is closed', () => {
    const state = nowState([], TODAY, '10:00', closedDayOf([holiday], TODAY));
    expect(state).toEqual({ kind: 'quiet', reason: 'closed', label: 'Vacances d’automne' });
    expect(quietText('closed', 'Vacances d’automne')).toBe('Vacances d’automne. Bon repos.');
  });

  it('says it is the weekend on Friday and Saturday', () => {
    expect(nowState([], '2026-11-13', '10:00')).toMatchObject({ kind: 'quiet', reason: 'weekend' });
    expect(nowState([], '2026-11-14', '10:00')).toMatchObject({ kind: 'quiet', reason: 'weekend' });
    expect(nowLead(nowState([], '2026-11-13', '10:00'))).toBe('C’est le week-end');
  });

  it('says there is no class on a school day without sessions', () => {
    expect(nowState([], TODAY, '10:00')).toMatchObject({ kind: 'quiet', reason: 'free' });
  });

  it('ignores sessions of other days', () => {
    const other = session('09:00', '10:00', { current: { ...DAY[0]!.current, date: '2026-11-11' } });
    expect(nowState([other], TODAY, '09:30')).toMatchObject({ kind: 'quiet', reason: 'free' });
  });
});

describe('closedDayOf', () => {
  it('finds a holiday covering today, not an exam week', () => {
    expect(closedDayOf([holiday], TODAY)).toBe(holiday);
    expect(closedDayOf([{ ...holiday, type: 'exam_week' }], TODAY)).toBeNull();
    expect(closedDayOf([holiday], '2026-11-20')).toBeNull();
  });
});

describe('dayStrip', () => {
  it('orders the day and marks past, current and upcoming', () => {
    const strip = dayStrip([DAY[2]!, DAY[0]!, DAY[1]!], TODAY, '09:30');
    expect(strip.map((d) => [d.session.current.startTime, d.phase])).toEqual([
      ['08:00', 'past'],
      ['09:00', 'current'],
      ['10:15', 'upcoming'],
    ]);
  });
});

describe('placeLine', () => {
  it('gives the room and the teacher, without an empty room', () => {
    expect(placeLine(DAY[0]!)).toBe('Salle 12, Hany Mansour');
    expect(placeLine(session('08:00', '09:00', { current: { ...DAY[0]!.current, roomName: null } }))).toBe('Hany Mansour');
  });
});
