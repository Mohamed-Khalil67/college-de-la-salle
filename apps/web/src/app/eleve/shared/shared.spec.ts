import { describe, expect, it } from 'vitest';
import type { EventDto, OccurrenceDto, StudentGradesDto, TermDto } from '@cdls/shared';
import { average, clock, dayTitle, dueBadge, plural, termOf, timeSpan } from './format';
import { attendanceCounts, isRecent, latestGrades, meterWidth, overallAverage, subjectsByName } from './grades';
import { eventIcs, fileName, shiftWeek, weekColumns, weekLabel, weekRange } from './week';

const event = (over: Partial<EventDto> = {}): EventDto => ({
  id: 'e1',
  kind: 'cours',
  title: 'Mathématiques',
  subjectId: 'mathematiques',
  classId: 'c1',
  sectionId: null,
  date: '2026-10-20',
  startTime: '08:30',
  endTime: '10:00',
  repeatUntil: null,
  place: 'Salle 12',
  description: '',
  attachments: [],
  coefficient: 1,
  authorId: 't1',
  authorName: 'Hany Mansour',
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  ...over,
});
const occ = (day: string, over: Partial<EventDto> = {}): OccurrenceDto => ({ key: `e1@${day}`, day, event: event(over) });

describe('format', () => {
  it('writes French clock times', () => {
    expect(clock('08:30')).toBe('8 h 30');
    expect(clock(null)).toBe('');
    expect(timeSpan('08:30', '10:00')).toBe('8 h 30 – 10 h 00');
    expect(timeSpan(null, null)).toBe('Toute la journée');
  });
  it('writes averages with one decimal', () => {
    expect(average(14)).toBe('14,0');
    expect(average(14.25)).toMatch(/^14,[23]$/);
    expect(average(null)).toBe('–');
  });
  it('capitalises the day', () => {
    expect(dayTitle('2026-10-20')).toBe('Mardi 20 octobre');
  });
  it('labels due dates', () => {
    expect(dueBadge('2026-10-19', '2026-10-20', false)?.label).toBe('En retard');
    expect(dueBadge('2026-10-20', '2026-10-20', false)?.label).toBe('Aujourd’hui');
    expect(dueBadge('2026-10-21', '2026-10-20', false)?.label).toBe('Demain');
    expect(dueBadge('2026-10-23', '2026-10-20', false)?.label).toBe('Dans 3 jours');
    expect(dueBadge('2026-11-23', '2026-10-20', false)).toBeNull();
    expect(dueBadge('2026-10-19', '2026-10-20', true)).toBeNull();
  });
  it('pluralises', () => {
    expect(plural(1, 'absence')).toBe('1 absence');
    expect(plural(2, 'absence')).toBe('2 absences');
  });
  it('finds the term of a day', () => {
    const t = (n: number, startsOn: string, endsOn: string): TermDto => ({
      id: `t${n}`,
      schoolYearId: 'y',
      number: n,
      label: `${n}e trimestre`,
      startsOn,
      endsOn,
      closedAt: null,
    });
    const terms = [t(2, '2027-01-03', '2027-03-25'), t(1, '2026-09-06', '2026-12-17')];
    expect(termOf(terms, '2026-10-20')?.id).toBe('t1');
    expect(termOf(terms, '2026-12-25')?.id).toBe('t1');
    expect(termOf(terms, '2026-08-01')?.id).toBe('t1');
    expect(termOf([], '2026-08-01')).toBeNull();
  });
});

describe('week', () => {
  it('keeps Sunday to Thursday and adds weekend days with events', () => {
    expect(weekColumns('2026-10-20', []).map((c) => c.day)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ]);
    const cols = weekColumns('2026-10-20', [occ('2026-10-24'), occ('2026-10-20')]);
    expect(cols.map((c) => c.day).at(-1)).toBe('2026-10-24');
    expect(cols.find((c) => c.day === '2026-10-20')?.items).toHaveLength(1);
  });
  it('computes ranges and labels', () => {
    expect(weekRange('2026-10-20')).toEqual({ from: '2026-10-18', to: '2026-10-24' });
    expect(shiftWeek('2026-10-20', -1)).toBe('2026-10-13');
    expect(weekLabel('2026-10-20')).toBe('Semaine du 18 au 22 octobre 2026');
    expect(weekLabel('2026-11-01')).toBe('Semaine du 1er au 5 novembre 2026');
    expect(weekLabel('2026-12-01')).toBe('Semaine du 29 novembre au 3 décembre 2026');
  });
  it('writes an .ics file and a safe file name', () => {
    const ics = eventIcs(event({ repeatUntil: '2026-12-17' }));
    expect(ics).toContain('DTSTART:20261020T083000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(fileName('Contrôle n° 3 : fonctions', 'ics')).toBe('controle-n-3-fonctions.ics');
    expect(fileName('***', 'pdf')).toBe('fichier.pdf');
  });
});

describe('grades', () => {
  const g = (id: string, subjectId: string, date: string, score: number) => ({
    grade: { id, eventId: id, studentId: 's', score, outOf: 20, comment: '', published: true, updatedAt: `${date}T10:00:00Z` },
    event: { id, kind: 'controle' as const, title: id, date, subjectId, coefficient: 1 },
  });
  const data: StudentGradesDto = {
    studentId: 's',
    subjects: [
      { subjectId: 'mathematiques', average: 15, grades: [g('a', 'mathematiques', '2026-10-01', 14), g('b', 'mathematiques', '2026-10-15', 16)] },
      { subjectId: 'anglais', average: null, grades: [] },
      { subjectId: 'francais', average: 12, grades: [g('c', 'francais', '2026-10-10', 12)] },
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
  it('averages subject averages and ignores empty subjects', () => {
    expect(overallAverage(data.subjects)).toBe(13.5);
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
      event: { id: 'e', kind: 'cours' as const, title: 'Maths', subjectId: null, startTime: null, endTime: null },
    });
    expect(attendanceCounts([rec('absent'), rec('absent'), rec('late')])).toEqual({ absent: 2, late: 1, excused: 0 });
  });
});
