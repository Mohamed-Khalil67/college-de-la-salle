import { describe, expect, it } from 'vitest';
import type { CalendarDayDto, ClassDto, EventDto } from '@cdls/shared';
import { assessmentsOf, emptyExam, examNotes, examProblem, examWeekOn, toExamInput } from './exam-logic';

const cls = { id: 'c1', sectionId: 's1', label: '1ère A' } as ClassDto;
const week = (over: Partial<CalendarDayDto> = {}): CalendarDayDto => ({
  id: 'd1',
  schoolYearId: 'y',
  type: 'exam_week',
  label: 'Examens du trimestre 1',
  startsOn: '2026-12-06',
  endsOn: '2026-12-10',
  sectionId: null,
  classIds: [],
  ...over,
});
const ev = (over: { classId?: string | null; gradable?: boolean; homework?: boolean; repeatable?: boolean }): EventDto =>
  ({
    classId: over.classId === undefined ? 'c1' : over.classId,
    type: { gradable: over.gradable ?? true, homework: over.homework ?? false, repeatable: over.repeatable ?? false },
  }) as EventDto;

describe('examProblem', () => {
  const ok = { ...emptyExam('2026-12-07'), activityTypeId: 't', classId: 'c1', subjectId: 'maths', startTime: '08:00', endTime: '10:00' };
  it('asks for each field in the order of the form', () => {
    expect(examProblem(emptyExam('2026-12-07'))).toMatch(/type/);
    expect(examProblem({ ...ok, classId: '' })).toBe('Choisissez la classe.');
    expect(examProblem({ ...ok, subjectId: '' })).toBe('Choisissez la matière.');
    expect(examProblem({ ...ok, date: '' })).toBe('Choisissez la date.');
    expect(examProblem({ ...ok, startTime: '' })).toMatch(/début/);
    expect(examProblem({ ...ok, endTime: '' })).toMatch(/fin/);
    expect(examProblem({ ...ok, endTime: '08:00' })).toMatch(/après/);
    expect(examProblem(ok)).toBeUndefined();
  });
});

describe('toExamInput', () => {
  const m = { ...emptyExam('2026-12-07'), activityTypeId: 't', classId: 'c1', subjectId: 'maths', startTime: '08:00', endTime: '10:00' };
  it('proposes a title and leaves the room empty as null', () => {
    expect(toExamInput(m, 'Examen', 'Mathématiques')).toMatchObject({ title: 'Examen de Mathématiques', roomId: null, classId: 'c1' });
  });
  it('keeps a typed title and a chosen room', () => {
    expect(toExamInput({ ...m, title: '  Final  ', roomId: 'r1' }, 'Examen', 'Maths')).toMatchObject({ title: 'Final', roomId: 'r1' });
  });
});

describe('examWeekOn', () => {
  it('finds a school-wide, a section or a class exam week, only for the audience', () => {
    expect(examWeekOn([week()], '2026-12-07', cls)).not.toBeNull();
    expect(examWeekOn([week({ sectionId: 's1' })], '2026-12-07', cls)).not.toBeNull();
    expect(examWeekOn([week({ sectionId: 's2' })], '2026-12-07', cls)).toBeNull();
    expect(examWeekOn([week({ classIds: ['c1'] })], '2026-12-07', cls)).not.toBeNull();
    expect(examWeekOn([week({ classIds: ['c2'] })], '2026-12-07', cls)).toBeNull();
  });
  it('ignores other kinds of day and days outside the dates', () => {
    expect(examWeekOn([week({ type: 'holiday' })], '2026-12-07', cls)).toBeNull();
    expect(examWeekOn([week()], '2026-12-11', cls)).toBeNull();
    expect(examWeekOn([week()], '2026-12-07', undefined)).toBeNull();
  });
});

describe('assessmentsOf and examNotes', () => {
  it('counts only graded, non-homework, non-weekly events of the class', () => {
    const events = [ev({}), ev({ homework: true }), ev({ gradable: false }), ev({ repeatable: true }), ev({ classId: 'c2' }), ev({ classId: null })];
    expect(assessmentsOf(events, 'c1')).toBe(1);
  });
  it('says whether the day is in an exam week and warns of an overloaded day', () => {
    expect(examNotes([week()], [], '2026-12-07', cls)).toEqual(['Ce jour est dans la semaine d’examens « Examens du trimestre 1 ».']);
    const notes = examNotes([], [ev({}), ev({})], '2026-12-07', cls);
    expect(notes[0]).toMatch(/pas dans une semaine d’examens/);
    expect(notes[1]).toMatch(/2 évaluations/);
    expect(examNotes([week()], [], '', cls)).toEqual([]);
  });
});
