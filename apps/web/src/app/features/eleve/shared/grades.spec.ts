import { describe, expect, it } from 'vitest';
import type { ActivityTypeSummary, StudentGradesDto } from '@cdls/shared';
import { attendanceCounts, isRecent, latestGrades, meterWidth, overallAverage, subjectsByName } from './grades';

const type = (code: string, flags: Partial<ActivityTypeSummary> = {}): ActivityTypeSummary => ({
  id: `type-${code}`,
  code,
  label: code,
  colour: 'navy',
  icon: 'book',
  gradable: false,
  repeatable: false,
  homework: false,
  ...flags,
});
const COURS = type('cours', { repeatable: true });
const CONTROLE = type('controle', { gradable: true });

describe('grades', () => {
  const g = (id: string, subjectId: string, date: string, score: number) => ({
    grade: { id, eventId: id, studentId: 's', score, outOf: 20, comment: '', published: true, updatedAt: `${date}T10:00:00Z` },
    event: { id, type: CONTROLE, title: id, date, subjectId, coefficient: 1, periodId: null },
  });
  const data: StudentGradesDto = {
    studentId: 's',
    subjects: [
      { subjectId: 'mathematiques', average: 15, coefficient: 3, grades: [g('a', 'mathematiques', '2026-10-01', 14), g('b', 'mathematiques', '2026-10-15', 16)] },
      { subjectId: 'anglais', average: null, coefficient: 2, grades: [] },
      { subjectId: 'francais', average: 12, coefficient: 1, grades: [g('c', 'francais', '2026-10-10', 12)] },
    ],
  };
  it('sorts subjects by name and grades newest first', () => {
    const subjects = subjectsByName(data);
    expect(subjects.map((s) => s.subjectId)).toEqual(['anglais', 'francais', 'mathematiques']);
    expect(subjects[2]!.grades[0]!.grade.id).toBe('b');
  });
  it('lists the latest grades', () => {
    expect(latestGrades(data, 2).map((x) => x.grade.id)).toEqual(['b', 'c']);
  });
  it('weights subject averages by their coefficient, like the report card', () => {
    // (15 × 3 + 12 × 1) / 4; anglais has no grade
    expect(overallAverage(data.subjects)).toBe(14.3);
    // A subject not taught in the class (no coefficient) is left out, as on the report card.
    expect(overallAverage([...data.subjects, { average: 20, coefficient: null }])).toBe(14.3);
    expect(overallAverage([{ average: 11, coefficient: null }])).toBeNull();
    expect(overallAverage([])).toBeNull();
  });
  it('flags recent grades and sizes meters', () => {
    expect(isRecent('2026-10-15T10:00:00Z', '2026-10-20')).toBe(true);
    expect(isRecent('2026-10-01T10:00:00Z', '2026-10-20')).toBe(false);
    expect(meterWidth(15)).toBe(75);
    expect(meterWidth(null)).toBe(0);
  });
  it('counts attendance records', () => {
    const rec = (status: 'absent' | 'late' | 'excused') => ({
      record: { id: status, eventId: 'e', studentId: 's', date: '2026-10-01', status, minutesLate: null, note: '' },
      event: { id: 'e', type: COURS, title: 'Maths', subjectId: null, startTime: null, endTime: null },
    });
    expect(attendanceCounts([rec('absent'), rec('absent'), rec('late')])).toEqual({ absent: 2, late: 1, excused: 0 });
  });
});
