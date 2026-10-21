import {
  ACTIVITY_COLOURS,
  ACTIVITY_ICONS,
  type CalendarEvent,
  closureCovers,
  isAssessment,
  nextExam,
  occurrences,
  skippedDays,
  SYSTEM_ACTIVITY_TYPES,
  toIcs,
} from './calendar.js';
import {
  audienceMatches,
  averageOnTwenty,
  generalAverage,
  gradesBySubject,
  TARGET_OPTIONS,
  type Grade,
} from './space.js';
import { MATIERES, matieresFor } from './subjects.js';

const grade = (
  subject: string,
  score: number,
  outOf = 20,
  coefficient = 1,
  createdAt = 0,
): Grade => ({
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
  type: { label: 'Cours', repeatable: true, gradable: false, homework: false },
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

  it('weights the general average by subject coefficient, like the report card', () => {
    expect(
      generalAverage([
        { average: 12, coefficient: 3 },
        { average: 16, coefficient: 1 },
        { average: null, coefficient: 4 },
        { average: 5, coefficient: null },
        { average: 2, coefficient: 0 },
      ]),
    ).toBe(13);
    expect(generalAverage([{ average: 14.25, coefficient: 1 }])).toBe(14.3);
    expect(generalAverage([{ average: 10, coefficient: null }])).toBeNull();
    expect(generalAverage([])).toBeNull();
  });

  it('groups grades by subject, newest first', () => {
    const groups = gradesBySubject([
      grade('svt', 12, 20, 1, 1),
      grade('arabe', 15),
      grade('svt', 18, 20, 1, 2),
    ]);
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
    expect(ics).toContain('SUMMARY:Cours — Mathématiques');
    expect(ics).not.toContain('EXDATE');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('only repeats repeatable types', () => {
    const exam = { label: 'Examen', repeatable: false, gradable: true, homework: false };
    const list = occurrences([event({ type: exam, repeatUntil: '2026-10-25' })], '2026-10-01', '2026-10-31');
    expect(list.map((o) => o.day)).toEqual(['2026-10-04']);
  });

  const autumn = { startsOn: '2026-10-17', endsOn: '2026-10-24' };

  it('skips weekly sessions on a holiday of their audience', () => {
    const weekly = event({ repeatUntil: '2026-10-31' });
    const days = (targets: string[]) =>
      occurrences([weekly], '2026-10-10', '2026-10-31', [{ ...autumn, targets }]).map((o) => o.day);
    expect(days(['all'])).toEqual(['2026-10-11', '2026-10-25']);
    expect(days(['bac'])).toEqual(['2026-10-11', '2026-10-25']);
    expect(days(['bac-premiere'])).toEqual(['2026-10-11', '2026-10-25']);
    // Another section or class keeps its sessions.
    expect(days(['nationale'])).toEqual(['2026-10-11', '2026-10-18', '2026-10-25']);
    expect(days(['bac-seconde'])).toEqual(['2026-10-11', '2026-10-18', '2026-10-25']);
  });

  it('keeps one-off events, and school-wide series during a one-section holiday', () => {
    const oneOff = event({ date: '2026-10-18' });
    expect(occurrences([oneOff], '2026-10-10', '2026-10-31', [{ ...autumn, targets: ['all'] }])).toHaveLength(1);
    const schoolWide = event({ target: 'all', repeatUntil: '2026-10-25' });
    expect(occurrences([schoolWide], '2026-10-10', '2026-10-31', [{ ...autumn, targets: ['bac'] }])).toHaveLength(3);
  });

  it('matches closure audiences', () => {
    expect(closureCovers({ ...autumn, targets: ['all'] }, 'all')).toBe(true);
    expect(closureCovers({ ...autumn, targets: ['bac'] }, 'all')).toBe(false);
    expect(closureCovers({ ...autumn, targets: ['bac'] }, 'bac-terminale')).toBe(true);
    expect(closureCovers({ ...autumn, targets: ['bac-premiere'] }, 'bac')).toBe(false);
  });

  it('writes EXDATE lines for the cancelled sessions', () => {
    const weekly = event({ repeatUntil: '2026-12-20' });
    const closures = [{ ...autumn, targets: ['all'] }];
    expect(skippedDays(weekly, closures)).toEqual(['2026-10-18']);
    expect(toIcs(weekly, closures)).toContain('EXDATE:20261018T083000\r\n');
    const allDay = event({ start: '', end: '', repeatUntil: '2026-12-20' });
    expect(toIcs(allDay, closures)).toContain('EXDATE;VALUE=DATE:20261018\r\n');
  });

  it('finds the next assessment by its flags', () => {
    const exam = event({ id: 'ex', date: '2026-10-20', type: { label: 'Examen', repeatable: false, gradable: true, homework: false } });
    const homework = event({ id: 'hw', date: '2026-10-19', type: { label: 'Devoir', repeatable: false, gradable: true, homework: true } });
    const list = occurrences([exam, homework, event({})], '2026-10-01', '2026-10-31');
    expect(nextExam(list, '2026-10-05')?.event.id).toBe('ex');
  });
});

describe('activity types', () => {
  it('system types have unique codes, palette colours and icons', () => {
    expect(new Set(SYSTEM_ACTIVITY_TYPES.map((t) => t.code)).size).toBe(SYSTEM_ACTIVITY_TYPES.length);
    for (const t of SYSTEM_ACTIVITY_TYPES) {
      expect(ACTIVITY_COLOURS).toContain(t.colour);
      expect(ACTIVITY_ICONS).toContain(t.icon);
    }
  });

  it('only exams and tests are assessments', () => {
    expect(SYSTEM_ACTIVITY_TYPES.filter(isAssessment).map((t) => t.code)).toEqual(['examen', 'controle']);
  });
});

describe('subjects', () => {
  it('has unique ids and subjects for both tracks', () => {
    expect(new Set(MATIERES.map((m) => m.id)).size).toBe(MATIERES.length);
    expect(matieresFor('bac').length).toBeGreaterThan(0);
    expect(matieresFor('nationale').length).toBeGreaterThan(0);
  });
});
