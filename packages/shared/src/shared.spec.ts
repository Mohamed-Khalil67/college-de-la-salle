import { occurrences, toIcs, type CalendarEvent } from './calendar.js';
import { audienceMatches, averageOnTwenty, gradesBySubject, TARGET_OPTIONS, type Grade } from './space.js';
import { MATIERES, matieresFor } from './subjects.js';

const grade = (subject: string, score: number, outOf = 20, coefficient = 1, createdAt = 0): Grade => ({
  id: `${subject}-${score}`,
  studentUid: 's1',
  studentName: 'Élève',
  eventId: 'e1',
  subject,
  title: 'Contrôle',
  score,
  outOf,
  coefficient,
  comment: '',
  published: true,
  teacherUid: 't1',
  teacherName: 'Prof',
  createdAt,
});

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'ev1',
  kind: 'cours',
  title: 'Mathématiques',
  subject: 'mathematiques',
  target: 'bac-premiere',
  date: '2026-10-04',
  start: '08:30',
  end: '10:00',
  repeatUntil: '',
  place: 'Salle 12',
  description: '',
  attachments: [],
  coefficient: 1,
  authorUid: 't1',
  authorName: 'Prof',
  createdAt: 0,
  ...overrides,
});

describe('grades', () => {
  it('weights the average on 20 by coefficient', () => {
    expect(averageOnTwenty([grade('maths', 10), grade('maths', 8, 10, 2)])).toBe(14);
    expect(averageOnTwenty([])).toBeNull();
  });

  it('groups grades by subject, newest first', () => {
    const groups = gradesBySubject([grade('svt', 12, 20, 1, 1), grade('arabe', 15), grade('svt', 18, 20, 1, 2)]);
    expect(groups.map((g) => g.subject)).toEqual(['arabe', 'svt']);
    expect(groups[1]?.grades.map((g) => g.score)).toEqual([18, 12]);
    expect(groups[1]?.average).toBe(15);
  });
});

describe('audiences', () => {
  it('matches the whole school, the section and the class', () => {
    expect(audienceMatches('all', 'bac', 'premiere')).toBe(true);
    expect(audienceMatches('bac', 'bac', 'premiere')).toBe(true);
    expect(audienceMatches('bac-premiere', 'bac', 'premiere')).toBe(true);
    expect(audienceMatches('nationale', 'bac', 'premiere')).toBe(false);
    expect(TARGET_OPTIONS).toHaveLength(9);
  });
});

describe('calendar', () => {
  it('expands a weekly event inside the range', () => {
    const list = occurrences([event({ repeatUntil: '2026-10-25' })], '2026-10-10', '2026-10-31');
    expect(list.map((o) => o.day)).toEqual(['2026-10-11', '2026-10-18', '2026-10-25']);
  });

  it('exports a weekly .ics event with its rule', () => {
    const ics = toIcs(event({ repeatUntil: '2026-12-20' }));
    expect(ics).toContain('DTSTART:20261004T083000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261220T235959');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('subjects', () => {
  it('has unique ids and subjects for both tracks', () => {
    expect(new Set(MATIERES.map((m) => m.id)).size).toBe(MATIERES.length);
    expect(matieresFor('bac').length).toBeGreaterThan(0);
    expect(matieresFor('nationale').length).toBeGreaterThan(0);
  });
});
