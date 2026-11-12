import { describe, expect, it } from 'vitest';
import type { ActivityTypeSummary, PeriodDto, SchoolYearDto } from '@cdls/shared';
import { average, clock, currentTerm, dayTitle, dueBadge, isAssessment, plural, termOf, timeSpan, whereOf } from './format';

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
  it('stands out exams and tests by their flags, not by their code', () => {
    expect(isAssessment(CONTROLE)).toBe(true);
    expect(isAssessment(type('teacher-quiz', { gradable: true }))).toBe(true);
    expect(isAssessment(COURS)).toBe(false);
    expect(isAssessment(type('devoir', { gradable: true, homework: true }))).toBe(false);
    expect(isAssessment(type('tp', { gradable: true, repeatable: true }))).toBe(false);
  });
  it('shows the room of the school before the free-text place', () => {
    expect(whereOf({ roomName: 'Laboratoire', place: 'Salle 12' })).toBe('Laboratoire');
    expect(whereOf({ roomName: null, place: 'Stade municipal' })).toBe('Stade municipal');
  });
  it('pluralises', () => {
    expect(plural(1, 'absence')).toBe('1 absence');
    expect(plural(2, 'absence')).toBe('2 absences');
  });
  it('finds the term of a day', () => {
    const t = (n: number, startsOn: string, endsOn: string): PeriodDto => ({
      id: `t${n}`,
      schoolYearId: 'y',
      kind: 'trimester',
      sectionId: null,
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

describe('currentTerm', () => {
  const period = (id: string, startsOn: string, endsOn: string): PeriodDto => ({
    id,
    schoolYearId: 'y',
    kind: 'trimester',
    sectionId: null,
    number: 1,
    label: id,
    startsOn,
    endsOn,
    closedAt: null,
  });
  const year = (isCurrent: boolean, periods: PeriodDto[]): SchoolYearDto => ({
    id: isCurrent ? 'now' : 'old',
    label: isCurrent ? '2026-2027' : '2025-2026',
    startsOn: '2026-09-01',
    endsOn: '2027-06-30',
    isCurrent,
    status: isCurrent ? 'current' : 'archived',
    archivedAt: null,
    periods,
  });
  it('is the term of today in the current year', () => {
    const years = [year(false, [period('old', '2025-09-01', '2025-12-15')]), year(true, [period('t1', '2026-09-01', '2026-12-15'), period('t2', '2027-01-01', '2027-03-31')])];
    expect(currentTerm(years, '2026-11-10')?.id).toBe('t1');
  });
  it('is null without a school year', () => {
    expect(currentTerm([], '2026-11-10')).toBeNull();
  });
});
