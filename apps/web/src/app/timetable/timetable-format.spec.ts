import { describe, expect, it } from 'vitest';
import type { SessionValuesDto, TimetableOccurrenceDto } from '@cdls/shared';
import {
  byDayOfWeek,
  changeLines,
  gridRows,
  isStruck,
  sessionSummary,
  sessionTitle,
  timeBands,
  weekWindow,
} from './timetable-format';

const values = (over: Partial<SessionValuesDto> = {}): SessionValuesDto => ({
  date: '2026-11-01',
  startTime: '08:30',
  endTime: '10:00',
  roomId: 'r1',
  roomName: 'Salle 12',
  teacherId: 't1',
  teacherName: 'Hany Mansour',
  ...over,
});

const session = (over: Partial<TimetableOccurrenceDto> = {}): TimetableOccurrenceDto => ({
  key: 's1@2026-11-01',
  slotId: 's1',
  originalDate: '2026-11-01',
  status: 'normal',
  current: values(),
  original: values(),
  changes: [],
  movedTo: null,
  exceptionId: null,
  reason: '',
  classId: 'c1',
  classLabel: 'Première',
  subjectId: 'mathematiques',
  subjectName: 'Mathématiques',
  activityType: {
    id: 'ty',
    code: 'cours',
    label: 'Cours',
    colour: 'navy',
    icon: 'book',
    gradable: false,
    repeatable: true,
    homework: false,
  },
  division: null,
  canChange: false,
  ...over,
});

describe('changeLines', () => {
  it('says nothing for a plain session', () => {
    expect(changeLines(session())).toEqual([]);
  });

  it('writes the cancellation and its reason', () => {
    expect(changeLines(session({ status: 'cancelled', reason: 'Enseignant absent' }))).toEqual([
      'Cette séance n’a pas lieu.',
      'Motif : Enseignant absent',
    ]);
    expect(isStruck(session({ status: 'cancelled' }))).toBe(true);
    expect(isStruck(session({ status: 'moved_from' }))).toBe(true);
    expect(isStruck(session({ status: 'moved' }))).toBe(false);
  });

  it('writes « avant / maintenant » for a move, and where a moved session went', () => {
    const now = values({ date: '2026-11-03', startTime: '14:00', endTime: '15:30' });
    const moved = session({ status: 'moved', current: now, changes: ['date', 'time'] });
    expect(changeLines(moved)).toEqual([
      'Avant : Dim. 1 nov., 8 h 30 – 10 h 00. Maintenant : Mar. 3 nov., 14 h 00 – 15 h 30.',
    ]);
    expect(changeLines(session({ status: 'moved_from', movedTo: now }))).toEqual([
      'Déplacée au Mar. 3 nov., 14 h 00 – 15 h 30.',
    ]);
  });

  it('writes the room and the teacher that changed', () => {
    const room = session({
      status: 'room_change',
      current: values({ roomId: 'r2', roomName: 'Laboratoire' }),
      changes: ['room'],
    });
    expect(changeLines(room)).toEqual(['Salle : avant Salle 12, maintenant Laboratoire.']);
    const substitute = session({
      status: 'substitute',
      current: values({ teacherId: 't2', teacherName: 'Sherif Nassar' }),
      changes: ['teacher'],
    });
    expect(changeLines(substitute)).toEqual([
      'Enseignant : avant Hany Mansour, maintenant Sherif Nassar.',
    ]);
  });
});

describe('titles and summaries', () => {
  it('names the type unless it is a plain lesson', () => {
    expect(sessionTitle(session())).toBe('Mathématiques');
    const tp = session({ activityType: { ...session().activityType, code: 'tp', label: 'TP' } });
    expect(sessionTitle(tp)).toBe('Mathématiques (TP)');
  });

  it('summarises a session for assistive technology', () => {
    expect(sessionSummary(session({ status: 'cancelled' }))).toBe(
      'Dimanche 1 novembre 8 h 30 – 10 h 00, Mathématiques, Salle 12, Hany Mansour, annulée',
    );
    expect(sessionSummary(session(), true)).toContain('Première');
  });
});

describe('week layout', () => {
  const sun = session({ key: 'a' });
  const tue = session({ key: 'b', current: values({ date: '2026-11-03', startTime: '09:00', endTime: '10:00' }) });
  const early = session({ key: 'c', current: values({ date: '2026-11-03', startTime: '07:30', endTime: '08:30' }) });

  it('shows Sunday to Thursday always, other days only with sessions, sorted by start', () => {
    const week = byDayOfWeek('2026-11-01', [tue, sun, early]);
    expect(week.map((d) => d.day)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
    expect(week[2]!.items.map((o) => o.key)).toEqual(['c', 'b']);
    const friday = session({ key: 'f', current: values({ date: '2026-11-06' }) });
    expect(byDayOfWeek('2026-11-01', [friday]).map((d) => d.day)).toContain('2026-11-06');
  });

  it('lists distinct time ranges and the grid rows (standard hours plus extra starts)', () => {
    expect(timeBands([tue, sun, early]).map((b) => b.start)).toEqual(['07:30', '08:30', '09:00']);
    const rows = gridRows([sun, early]).map((b) => b.start);
    expect(rows[0]).toBe('07:30');
    expect(rows).toContain('08:30');
    expect(rows).toContain('08:00');
    expect(rows).toEqual([...rows].sort());
  });

  it('gives the Sunday-first week of any day', () => {
    expect(weekWindow('2026-11-04')).toEqual({ from: '2026-11-01', to: '2026-11-07' });
  });
});
