import { describe, expect, it } from 'vitest';
import type { ClassDto, EventDto, SectionDto, TeachingAssignmentDto } from '@cdls/shared';
import {
  audienceFromValue,
  audienceLabel,
  audienceOptions,
  columnAverage,
  emptyEventModel,
  gradeIssues,
  groupByClass,
  isValidScore,
  issuesSentence,
  modelFromEvent,
  rollCounts,
  rollSentence,
  rowAverage,
  timeProblem,
  toEventInput,
} from './teacher';

const assignment = (id: string, classId: string, classLabel: string, subjectId: string, subjectName: string): TeachingAssignmentDto => ({
  id,
  teacherId: 't',
  teacherName: 'Hany Mansour',
  classId,
  classLabel,
  subjectId,
  subjectName,
  coefficient: 4,
});
const klass = (id: string, label: string, sectionId: string, sectionCode: 'bac' | 'nationale'): ClassDto => ({
  id,
  schoolYearId: 'y',
  sectionId,
  sectionCode,
  code: id,
  label,
  studentCount: 10,
});
const sections: SectionDto[] = [
  { id: 's-nat', code: 'nationale', label: 'Bac nationale' },
  { id: 's-bac', code: 'bac', label: 'Bac français' },
];
const classes = [klass('c1', 'Première', 's-bac', 'bac'), klass('c2', '1re secondaire', 's-nat', 'nationale')];
const assignments = [
  assignment('a1', 'c1', 'Première', 'mathematiques', 'Mathématiques'),
  assignment('a2', 'c1', 'Première', 'informatique', 'Informatique'),
  assignment('a3', 'c2', '1re secondaire', 'mathematiques', 'Mathématiques'),
];

describe('classes', () => {
  it('groups assignments by class with the class size', () => {
    const groups = groupByClass(assignments, classes);
    expect(groups.map((g) => g.label)).toEqual(['Première', '1re secondaire']);
    expect(groups[0]!.subjects.map((s) => s.name)).toEqual(['Informatique', 'Mathématiques']);
    expect(groups[0]!.studentCount).toBe(10);
    expect(groups[0]!.sectionLabel).toBe('Bac français');
  });
});

describe('event form', () => {
  it('maps the form to the API input and drops what the kind does not allow', () => {
    const model = { ...emptyEventModel('2026-10-20', 'a1'), title: ' Contrôle ', kind: 'controle' as const, weekly: true, repeatUntil: '2026-12-01', coefficient: 2, startTime: '08:30' };
    expect(toEventInput(model, assignments)).toMatchObject({
      kind: 'controle',
      title: 'Contrôle',
      classId: 'c1',
      subjectId: 'mathematiques',
      repeatUntil: null,
      coefficient: 2,
      startTime: '08:30',
      endTime: null,
    });
    const course = { ...model, kind: 'cours' as const, coefficient: 3 };
    expect(toEventInput(course, assignments)).toMatchObject({ repeatUntil: '2026-12-01', coefficient: 1 });
  });
  it('reads an event back into the form', () => {
    const e = { kind: 'tp', title: 'TP', classId: 'c1', subjectId: 'informatique', date: '2026-10-20', startTime: null, endTime: null, repeatUntil: '2026-11-20', place: '', description: '', coefficient: 1 } as unknown as EventDto;
    expect(modelFromEvent(e, assignments)).toMatchObject({ assignmentId: 'a2', weekly: true, startTime: '' });
  });
  it('checks times', () => {
    expect(timeProblem('', '10:00')).toMatch(/début/);
    expect(timeProblem('10:00', '09:00')).toMatch(/suivre/);
    expect(timeProblem('08:00', '09:00')).toBeNull();
    expect(timeProblem('', '')).toBeNull();
  });
});

describe('grade grid', () => {
  it('validates scores against the scale', () => {
    expect(isValidScore(null, 20)).toBe(true);
    expect(isValidScore(20, 20)).toBe(true);
    expect(isValidScore(24, 20)).toBe(false);
    expect(isValidScore(Number.NaN, 20)).toBe(false);
  });
  it('averages rows and columns on 20, ignoring invalid cells', () => {
    expect(rowAverage([{ score: 10, outOf: 20, coefficient: 1 }, { score: 16, outOf: 20, coefficient: 2 }, { score: 30, outOf: 20, coefficient: 1 }])).toBe(14);
    expect(rowAverage([{ score: null, outOf: 20, coefficient: 1 }])).toBeNull();
    expect(columnAverage([10, 15, null, 25], 20)).toBe(12.5);
    expect(columnAverage([5, 10], 10)).toBe(15);
    expect(columnAverage([], 20)).toBeNull();
  });
  it('describes invalid and missing marks', () => {
    const issues = gradeIssues([{ name: 'Karim', score: 24 }, { name: 'Sami', score: null }, { name: 'Lina', score: 12 }], 20);
    expect(issues).toEqual({ invalid: ['Karim'], missing: ['Sami'] });
    expect(issuesSentence(issues)).toBe('1 note est hors barème (Karim) et 1 note manque (Sami).');
    expect(issuesSentence({ invalid: [], missing: [] })).toBe('');
  });
});

describe('roll call', () => {
  it('counts statuses and writes them out', () => {
    const counts = rollCounts(['present', 'present', 'absent', 'late']);
    expect(counts).toEqual({ present: 2, absent: 1, late: 1, excused: 0 });
    expect(rollSentence(counts)).toBe('2 présents, 1 absent, 1 en retard');
    expect(rollSentence({ present: 1, absent: 0, late: 0, excused: 2 })).toBe('1 présent, 0 absent, 0 en retard, 2 excusés');
  });
});

describe('audiences', () => {
  it('offers the teacher classes, their sections and everyone', () => {
    const options = audienceOptions([classes[0]!], sections);
    expect(options.map((o) => o.value)).toEqual(['class:c1', 'section:s-bac', 'all']);
    expect(audienceFromValue('class:c1')).toEqual({ classId: 'c1', sectionId: null });
    expect(audienceFromValue('section:s-bac')).toEqual({ classId: null, sectionId: 's-bac' });
    expect(audienceFromValue('all')).toEqual({ classId: null, sectionId: null });
  });
  it('labels a post audience', () => {
    expect(audienceLabel({ classId: 'c1', sectionId: null }, classes, sections)).toBe('Première');
    expect(audienceLabel({ classId: null, sectionId: 's-bac' }, classes, sections)).toBe('tout le Bac français');
    expect(audienceLabel({ classId: null, sectionId: null }, classes, sections)).toBe('tout le collège');
  });
});
