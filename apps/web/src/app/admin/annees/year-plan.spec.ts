import type { CalendarDayDto, ClassDto, PeriodDto, SchoolYearDto, SectionDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import {
  buildChecklist,
  dayInYearProblem,
  defaultPeriodLabel,
  nextPeriodNumber,
  rangeProblem,
  classToCompleteNext,
  entriesOfSection,
  nextStep,
  overlapHint,
  overlappingPeriods,
  placeInRows,
  toEntries,
} from './year-plan';

const NATIONALE: SectionDto = { id: 's1', code: 'nationale', label: 'Bac nationale' };
const BAC: SectionDto = { id: 's2', code: 'bac', label: 'Bac français' };

function period(id: string, over: Partial<PeriodDto> = {}): PeriodDto {
  return {
    id,
    schoolYearId: 'y',
    kind: 'trimester',
    sectionId: null,
    number: 1,
    label: `Période ${id}`,
    startsOn: '2026-09-01',
    endsOn: '2026-12-20',
    closedAt: null,
    ...over,
  };
}

function day(id: string, over: Partial<CalendarDayDto> = {}): CalendarDayDto {
  return {
    id,
    schoolYearId: 'y',
    type: 'holiday',
    label: `Jour ${id}`,
    startsOn: '2026-12-21',
    endsOn: '2027-01-03',
    sectionId: null,
    classIds: [],
    ...over,
  };
}

function schoolClass(id: string, sectionId: string): ClassDto {
  return { id, schoolYearId: 'y', sectionId, sectionCode: sectionId === 's1' ? 'nationale' : 'bac', code: id, label: id, studentCount: 0, nextClassId: null };
}

function year(periods: PeriodDto[], isCurrent = true): SchoolYearDto {
  return { id: 'y', label: '2026-2027', startsOn: '2026-09-01', endsOn: '2027-06-30', isCurrent, status: isCurrent ? 'current' : 'upcoming', archivedAt: null, periods };
}

describe('toEntries', () => {
  it('puts periods, holidays and exams in their lanes, sorted by start', () => {
    const entries = toEntries(
      [period('p1', { closedAt: '2026-12-21T10:00:00Z' })],
      [day('h', { startsOn: '2026-10-25', endsOn: '2026-11-01' }), day('e', { type: 'exam_week', startsOn: '2026-12-07', endsOn: '2026-12-13' })],
    );
    expect(entries.map((e) => [e.key, e.lane])).toEqual([
      ['period:p1', 'periods'],
      ['day:h', 'closures'],
      ['day:e', 'exams'],
    ]);
    expect(entries[0].locked).toBe(true);
    expect(entries[1].locked).toBe(false);
  });
});

describe('entriesOfSection', () => {
  const entries = toEntries(
    [period('all'), period('nat', { sectionId: 's1' }), period('fr', { sectionId: 's2' })],
    [day('c', { classIds: ['k2'] })],
  );
  const sectionOfClass = new Map([['k1', 's1'], ['k2', 's2']]);

  it('keeps school-wide and own entries', () => {
    expect(entriesOfSection(entries, 's1', sectionOfClass).map((e) => e.id)).toEqual(['all', 'nat']);
  });

  it('shows a day aimed at unknown classes in every section until they are known', () => {
    expect(entriesOfSection(entries, 's1', new Map()).map((e) => e.id).sort()).toEqual(['all', 'c', 'nat']);
  });

  it('adds the days aimed at classes of the section', () => {
    expect(entriesOfSection(entries, 's2', sectionOfClass).map((e) => e.id).sort()).toEqual(['all', 'c', 'fr']);
  });
});

describe('placeInRows', () => {
  it('stacks overlapping entries and reuses a free row', () => {
    const entries = toEntries(
      [],
      [
        day('a', { startsOn: '2026-10-01', endsOn: '2026-10-10' }),
        day('b', { startsOn: '2026-10-05', endsOn: '2026-10-12' }),
        day('c', { startsOn: '2026-10-11', endsOn: '2026-10-20' }),
      ],
    );
    const { placed, rows } = placeInRows(entries);
    expect(rows).toBe(2);
    expect(Object.fromEntries(placed.map((p) => [p.entry.id, p.row]))).toEqual({ a: 0, b: 1, c: 0 });
  });

  it('has one empty row without entries', () => {
    expect(placeInRows([]).rows).toBe(1);
  });
});

describe('overlappingPeriods', () => {
  const periods = [period('t1', { sectionId: 's1' }), period('s-all', { kind: 'semester' })];

  it('finds a period of the same kind and section whose dates cross', () => {
    const found = overlappingPeriods(periods, { kind: 'trimester', sectionId: 's1', startsOn: '2026-12-20', endsOn: '2027-03-01' });
    expect(found.map((p) => p.id)).toEqual(['t1']);
  });

  it('compares a school-wide period with every section, as the API does', () => {
    expect(overlappingPeriods(periods, { kind: 'trimester', sectionId: null, startsOn: '2026-10-01', endsOn: '2026-10-02' })).toHaveLength(1);
    expect(overlappingPeriods(periods, { kind: 'semester', sectionId: 's2', startsOn: '2026-10-01', endsOn: '2026-10-02' })).toHaveLength(1);
  });

  it('ignores another section, another kind, itself and later dates', () => {
    expect(overlappingPeriods(periods, { kind: 'trimester', sectionId: 's2', startsOn: '2026-10-01', endsOn: '2026-10-02' })).toEqual([]);
    expect(overlappingPeriods(periods, { id: 't1', kind: 'trimester', sectionId: 's1', startsOn: '2026-10-01', endsOn: '2026-10-02' })).toEqual([]);
    expect(overlappingPeriods(periods, { kind: 'trimester', sectionId: 's1', startsOn: '2026-12-21', endsOn: '2027-03-01' })).toEqual([]);
  });

  it('names the culprit', () => {
    expect(overlapHint([])).toBeNull();
    expect(overlapHint([period('t1', { label: '1er trimestre' })])).toContain('1er trimestre');
    expect(overlapHint([period('t1'), period('t2')])).toContain('Périodes en conflit');
  });
});

describe('buildChecklist', () => {
  const sections = [NATIONALE, BAC];
  const classes = [schoolClass('k1', 's1'), schoolClass('k2', 's2')];

  it('starts empty: every step still to do except the dates', () => {
    const steps = buildChecklist({ year: year([]), sections, days: [], classes: [], subjectCounts: new Map() });
    expect(steps.map((s) => [s.id, s.status])).toEqual([
      ['dates', 'done'],
      ['periods', 'todo'],
      ['closures', 'todo'],
      ['classes', 'todo'],
      ['subjects', 'todo'],
    ]);
    expect(nextStep(steps)?.id).toBe('periods');
  });

  it('is partial while a section has no period, and done with a school-wide one', () => {
    const partial = buildChecklist({ year: year([period('a', { sectionId: 's1' })]), sections, days: [], classes, subjectCounts: new Map() });
    expect(partial[1].status).toBe('partial');
    expect(partial[1].detail).toContain('1 filière sur 2');
    const done = buildChecklist({ year: year([period('a')]), sections, days: [], classes, subjectCounts: new Map() });
    expect(done[1].status).toBe('done');
  });

  it('needs both holidays and exam weeks', () => {
    const onlyHolidays = buildChecklist({ year: year([]), sections, days: [day('h')], classes, subjectCounts: new Map() });
    expect(onlyHolidays[2].status).toBe('partial');
    expect(onlyHolidays[2].detail).toContain('semaine d’examens');
    const both = buildChecklist({ year: year([]), sections, days: [day('h'), day('e', { type: 'exam_week' })], classes, subjectCounts: new Map() });
    expect(both[2].status).toBe('done');
  });

  it('resumes at the subjects step when everything before is done', () => {
    const steps = buildChecklist({
      year: year([period('a')]),
      sections,
      days: [day('h'), day('e', { type: 'exam_week' })],
      classes,
      subjectCounts: new Map([['k1', 8]]),
    });
    expect(steps[4].status).toBe('partial');
    expect(nextStep(steps)?.id).toBe('subjects');
    expect(classToCompleteNext(classes, new Map([['k1', 8]]))?.id).toBe('k2');
  });

  it('is finished when every step is done', () => {
    const steps = buildChecklist({
      year: year([period('a')]),
      sections,
      days: [day('h'), day('e', { type: 'exam_week' })],
      classes,
      subjectCounts: new Map([['k1', 8], ['k2', 6]]),
    });
    expect(nextStep(steps)).toBeNull();
  });

  it('keeps the dates done for a year that is not the current one yet, and says so', () => {
    const steps = buildChecklist({ year: year([], false), sections, days: [], classes, subjectCounts: new Map() });
    expect(steps[0].status).toBe('done');
    expect(steps[0].detail).toContain('pas encore l’année en cours');
  });
});

describe('period defaults', () => {
  it('names periods in French', () => {
    expect(defaultPeriodLabel('trimester', 1)).toBe('1er trimestre');
    expect(defaultPeriodLabel('trimester', 3)).toBe('3e trimestre');
    expect(defaultPeriodLabel('semester', 2)).toBe('2e semestre');
  });

  it('proposes the first free number for the kind and section', () => {
    const periods = [period('a', { number: 1, sectionId: 's1' }), period('b', { number: 2, sectionId: 's1' }), period('c', { number: 1, sectionId: 's2' })];
    expect(nextPeriodNumber(periods, 'trimester', 's1')).toBe(3);
    expect(nextPeriodNumber(periods, 'trimester', 's2')).toBe(2);
    expect(nextPeriodNumber(periods, 'semester', 's1')).toBe(1);
    expect(nextPeriodNumber([1, 2, 3, 4].map((n) => period(`p${n}`, { number: n })), 'trimester', null)).toBe(4);
  });
});

describe('rangeProblem', () => {
  const y = { label: '2026-2027', startsOn: '2026-09-01', endsOn: '2027-06-30' };

  it('wants a period to end after it starts, and a day to end on or after', () => {
    expect(rangeProblem('2026-10-01', '2026-10-01', y, false)).toBe('La fin doit suivre le début.');
    expect(rangeProblem('2026-10-01', '2026-10-01', y, true)).toBeNull();
    expect(rangeProblem('2026-10-02', '2026-10-01', y, true)).toBe('La fin ne peut pas précéder le début.');
  });

  it('keeps both dates inside the school year', () => {
    expect(rangeProblem('2026-08-31', '2026-10-01', y, false)).toContain('2026-2027');
    expect(rangeProblem('2026-10-01', '2027-07-01', y, true)).toContain('comprises dans l’année');
    expect(rangeProblem('2026-09-01', '2027-06-30', y, false)).toBeNull();
  });
});

describe('dayInYearProblem', () => {
  const y = { label: '2026-2027', startsOn: '2026-09-01', endsOn: '2027-06-30' };

  it('checks a single date against the year', () => {
    expect(dayInYearProblem('2026-09-01', y)).toBeNull();
    expect(dayInYearProblem('2027-06-30', y)).toBeNull();
    expect(dayInYearProblem('2030-01-01', y)).toContain('2026-2027');
    expect(dayInYearProblem('2026-08-31', y)).toContain('comprises dans l’année');
  });
});
