import { describe, expect, it } from 'vitest';
import type { OccurrenceDto } from './api.js';
import {
  type AbsenceRecord,
  absenceWindowStart,
  givenHomework,
  REPEATED_ABSENCE_MIN_DAYS,
  REPEATED_ABSENCE_WINDOW_DAYS,
  repeatedAbsences,
  rollCallDone,
  TEACHER_HOMEWORK_DAYS,
  TEACHER_TESTS_DAYS,
  upcomingTests,
} from './teacher-summary.js';

const TODAY = '2026-11-12';

interface Fake {
  readonly day: string;
  readonly key: string;
  readonly homework?: boolean;
  readonly gradable?: boolean;
  readonly repeatable?: boolean;
  readonly authorId?: string;
  readonly classId?: string | null;
}

function occurrence(f: Fake): OccurrenceDto {
  return {
    key: f.key,
    day: f.day,
    event: {
      authorId: f.authorId ?? 't1',
      classId: f.classId === undefined ? 'c1' : f.classId,
      type: { homework: f.homework ?? false, gradable: f.gradable ?? false, repeatable: f.repeatable ?? false },
    },
  } as unknown as OccurrenceDto;
}

describe('givenHomework', () => {
  it('keeps the teacher’s own homework due from today on, soonest first', () => {
    const list = [
      occurrence({ key: 'b', day: '2026-11-15', homework: true }),
      occurrence({ key: 'a', day: '2026-11-12', homework: true }),
      occurrence({ key: 'past', day: '2026-11-11', homework: true }),
      occurrence({ key: 'other', day: '2026-11-13', homework: true, authorId: 't2' }),
      occurrence({ key: 'test', day: '2026-11-13', gradable: true }),
    ];
    expect(givenHomework(list, 't1', TODAY).map((o) => o.key)).toEqual(['a', 'b']);
  });

  it('stops at the two-week horizon and at the count', () => {
    const list = [
      occurrence({ key: 'far', day: '2026-11-27', homework: true }),
      occurrence({ key: 'edge', day: '2026-11-26', homework: true }),
      occurrence({ key: 'near', day: '2026-11-13', homework: true }),
    ];
    expect(TEACHER_HOMEWORK_DAYS).toBe(14);
    expect(givenHomework(list, 't1', TODAY).map((o) => o.key)).toEqual(['near', 'edge']);
    expect(givenHomework(list, 't1', TODAY, 1).map((o) => o.key)).toEqual(['near']);
  });
});

describe('upcomingTests', () => {
  it('lists exams and tests of the given classes only, soonest first', () => {
    const list = [
      occurrence({ key: 'late', day: '2026-11-20', gradable: true }),
      occurrence({ key: 'soon', day: '2026-11-13', gradable: true }),
      occurrence({ key: 'weekly', day: '2026-11-13', gradable: true, repeatable: true }),
      occurrence({ key: 'hw', day: '2026-11-13', gradable: true, homework: true }),
      occurrence({ key: 'elsewhere', day: '2026-11-13', gradable: true, classId: 'c9' }),
      occurrence({ key: 'school', day: '2026-11-13', gradable: true, classId: null }),
      occurrence({ key: 'beyond', day: '2026-11-27', gradable: true }),
    ];
    expect(TEACHER_TESTS_DAYS).toBe(14);
    expect(upcomingTests(list, new Set(['c1']), TODAY).map((o) => o.key)).toEqual(['soon', 'late']);
  });
});

const record = (studentId: string, day: string, classId = 'c1', lastName = studentId): AbsenceRecord => ({
  studentId,
  firstName: 'Élève',
  lastName,
  classId,
  day,
});

describe('repeatedAbsences', () => {
  it('needs the threshold of distinct days', () => {
    expect(REPEATED_ABSENCE_MIN_DAYS).toBe(3);
    const two = [record('s1', '2026-11-10'), record('s1', '2026-11-11')];
    expect(repeatedAbsences(two, TODAY)).toEqual([]);
    const three = [...two, record('s1', '2026-11-12')];
    expect(repeatedAbsences(three, TODAY)).toMatchObject([{ studentId: 's1', days: 3, lastDay: '2026-11-12' }]);
  });

  it('counts a day once however many lessons were missed', () => {
    const records = [record('s1', '2026-11-10'), record('s1', '2026-11-10'), record('s1', '2026-11-10'), record('s1', '2026-11-11')];
    expect(repeatedAbsences(records, TODAY)).toEqual([]);
  });

  it('ignores days outside the window and in the future', () => {
    expect(absenceWindowStart(TODAY)).toBe('2026-10-14');
    expect(REPEATED_ABSENCE_WINDOW_DAYS).toBe(30);
    const records = [record('s1', '2026-10-13'), record('s1', '2026-10-14'), record('s1', '2026-11-01'), record('s1', '2026-11-13')];
    expect(repeatedAbsences(records, TODAY)).toEqual([]);
    expect(repeatedAbsences([...records, record('s1', '2026-11-12')], TODAY)).toMatchObject([{ days: 3 }]);
  });

  it('puts the student with the most days first, then the most recent, then by name', () => {
    const days = (id: string, list: string[], lastName = id) => list.map((d) => record(id, d, 'c1', lastName));
    const records = [
      ...days('a', ['2026-11-01', '2026-11-02', '2026-11-03']),
      ...days('b', ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']),
      ...days('c', ['2026-11-05', '2026-11-06', '2026-11-07']),
      ...days('d', ['2026-11-05', '2026-11-06', '2026-11-07'], 'Aaa'),
    ];
    expect(repeatedAbsences(records, TODAY).map((t) => t.studentId)).toEqual(['b', 'd', 'c', 'a']);
    expect(repeatedAbsences(records, TODAY, 2)).toHaveLength(2);
  });
});

describe('rollCallDone', () => {
  const session = { classId: 'c1', startTime: '09:00', endTime: '10:00' };

  it('is true when a roll call exists for an event of the class that overlaps the session', () => {
    expect(rollCallDone(session, [{ classId: 'c1', startTime: '09:00', endTime: '10:00' }])).toBe(true);
    expect(rollCallDone(session, [{ classId: 'c1', startTime: '09:30', endTime: '11:00' }])).toBe(true);
  });

  it('is false for another class, no roll call, or a neighbouring hour', () => {
    expect(rollCallDone(session, [])).toBe(false);
    expect(rollCallDone(session, [{ classId: 'c2', startTime: '09:00', endTime: '10:00' }])).toBe(false);
    expect(rollCallDone(session, [{ classId: 'c1', startTime: '10:00', endTime: '11:00' }])).toBe(false);
    expect(rollCallDone(session, [{ classId: 'c1', startTime: '08:00', endTime: '09:00' }])).toBe(false);
  });
});
