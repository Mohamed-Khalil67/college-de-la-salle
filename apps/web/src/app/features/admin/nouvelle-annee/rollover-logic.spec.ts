import { describe, expect, it } from 'vitest';
import type { RolloverStudentPlan } from '@cdls/shared';
import {
  actionsFor,
  applyToStudents,
  consequences,
  groupsLine,
  countActions,
  effectiveAction,
  filterStudents,
  fold,
  NO_FILTERS,
  pageCount,
  pageSlice,
  parseDraft,
  setChoice,
  suggestNewYear,
  toOverrides,
  toRequest,
} from './rollover-logic';

const student = (over: Partial<RolloverStudentPlan> = {}): RolloverStudentPlan => ({
  studentId: 's1',
  firstName: 'Élodie',
  lastName: 'Marchand',
  studentNumber: 'CDLS-0001',
  sectionCode: 'bac',
  sourceClassId: 'c-seconde',
  sourceClassLabel: 'Seconde',
  defaultAction: 'promote',
  action: 'promote',
  targetClassLabel: 'Première',
  skipped: null,
  ...over,
});

const terminal = (id: string) => student({ studentId: id, firstName: 'Zoé', lastName: 'Fahmy', sourceClassId: 'c-term', sourceClassLabel: 'Terminale', defaultAction: 'graduate', action: 'graduate', targetClassLabel: null });

describe('choices', () => {
  it('offers « Diplômé » only in a terminal class and « Promu » only elsewhere', () => {
    expect(actionsFor(student())).toEqual(['promote', 'repeat', 'leave', 'section_change']);
    expect(actionsFor(terminal('t'))).toEqual(['graduate', 'repeat', 'leave']);
  });

  it('keeps only what differs from the default, and picking the default again removes it', () => {
    const s = student();
    const one = setChoice(new Map(), s, 'repeat');
    expect(effectiveAction(s, one)).toBe('repeat');
    expect(toOverrides(one)).toEqual([{ studentId: 's1', action: 'repeat' }]);
    expect(setChoice(one, s, 'promote').size).toBe(0);
    // An action that does not fit the class is ignored.
    expect(setChoice(new Map(), s, 'graduate').size).toBe(0);
  });

  it('applies an action to the filtered students and counts those it does not fit or already placed', () => {
    const list = [student({ studentId: 'a' }), student({ studentId: 'b', skipped: 'already_enrolled' }), terminal('c')];
    const r = applyToStudents(new Map(), list, 'repeat');
    expect([...r.choices.keys()].sort()).toEqual(['a', 'c']);
    expect(r.changed).toBe(2);
    expect(r.left).toBe(1);
    // « Tous promus » is the empty choice set: the default for everybody.
    expect(applyToStudents(r.choices, list, 'promote').choices.has('a')).toBe(false);
    expect(applyToStudents(r.choices, list, 'promote').left).toBe(2);
  });

  it('counts the students per action, leaving out those already placed', () => {
    const list = [student({ studentId: 'a' }), student({ studentId: 'b', skipped: 'already_enrolled' }), terminal('c'), terminal('d')];
    const choices = new Map([['d', 'leave' as const]]);
    expect(countActions(list, choices)).toEqual({ promote: 1, repeat: 0, leave: 1, graduate: 1, section_change: 0 });
  });
});

describe('filters and paging', () => {
  const list = [
    student({ studentId: 'a', firstName: 'Élodie', lastName: 'Marchand' }),
    student({ studentId: 'b', firstName: 'Karim', lastName: 'Haddad', studentNumber: 'CDLS-0002' }),
    terminal('c'),
  ];

  it('searches names without accents or case, in either order, and the student number', () => {
    expect(fold('  Élodie ')).toBe('elodie');
    expect(filterStudents(list, new Map(), { ...NO_FILTERS, query: 'elodie' }).map((s) => s.studentId)).toEqual(['a']);
    expect(filterStudents(list, new Map(), { ...NO_FILTERS, query: 'haddad karim' }).length).toBe(1);
    expect(filterStudents(list, new Map(), { ...NO_FILTERS, query: 'karim haddad' }).length).toBe(1);
    expect(filterStudents(list, new Map(), { ...NO_FILTERS, query: '0002' }).map((s) => s.studentId)).toEqual(['b']);
  });

  it('filters by class, by action and by the choices made', () => {
    const choices = new Map([['a', 'repeat' as const]]);
    expect(filterStudents(list, choices, { ...NO_FILTERS, classId: 'c-term' }).map((s) => s.studentId)).toEqual(['c']);
    expect(filterStudents(list, choices, { ...NO_FILTERS, action: 'repeat' }).map((s) => s.studentId)).toEqual(['a']);
    expect(filterStudents(list, choices, { ...NO_FILTERS, action: 'promote' }).map((s) => s.studentId)).toEqual(['b']);
    expect(filterStudents(list, choices, { ...NO_FILTERS, action: 'changed' }).map((s) => s.studentId)).toEqual(['a']);
  });

  it('pages a long list of 650 students and keeps the page inside it', () => {
    const many = Array.from({ length: 650 }, (_, i) => i);
    expect(pageCount(650, 25)).toBe(26);
    expect(pageCount(0, 25)).toBe(1);
    expect(pageSlice(many, 1, 25)).toHaveLength(25);
    expect(pageSlice(many, 26, 25)).toEqual(many.slice(625));
    expect(pageSlice(many, 99, 25)).toEqual(many.slice(625));
    expect(pageSlice(many, 0, 25)[0]).toBe(0);
  });
});

describe('the request', () => {
  it('proposes the next year one year on, and 29 February moves to 28', () => {
    expect(suggestNewYear({ label: '2026-2027', startsOn: '2026-09-06', endsOn: '2027-06-17' })).toEqual({
      label: '2027-2028',
      startsOn: '2027-09-06',
      endsOn: '2028-06-17',
    });
    expect(suggestNewYear({ label: '2027-2028', startsOn: '2027-09-06', endsOn: '2028-02-29' }).endsOn).toBe('2029-02-28');
  });

  it('sends the timetable only with the assignments, and the choices only when there are some', () => {
    const base = { sourceYearId: 'y', label: ' 2027-2028 ', startsOn: '2027-09-06', endsOn: '2028-06-17', copyAssignments: false, copyTimetable: true };
    expect(toRequest(base, new Map())).toEqual({ sourceYearId: 'y', label: '2027-2028', startsOn: '2027-09-06', endsOn: '2028-06-17', copyAssignments: false, copyTimetable: false });
    expect(toRequest({ ...base, copyAssignments: true }, new Map([['s', 'leave' as const]]))).toMatchObject({
      copyTimetable: true,
      overrides: [{ studentId: 's', action: 'leave' }],
    });
  });

  it('says what the confirmation restates', () => {
    expect(consequences({ promote: 10, repeat: 1, leave: 2, graduate: 3, section_change: 1 })).toEqual([
      '3 élèves sont diplômés : compte archivé, plus de connexion.',
      '2 élèves quittent le collège : compte archivé, plus de connexion.',
      '1 élève redouble : même niveau dans la nouvelle année.',
      '1 demande de changement de section sera ouverte, à valider dans « Validations ».',
    ]);
    expect(consequences({ promote: 4, repeat: 0, leave: 0, graduate: 0, section_change: 0 })).toEqual([]);
  });
});

describe('the saved draft', () => {
  const draft = {
    sourceYearId: 'y',
    label: '2027-2028',
    startsOn: '2027-09-06',
    endsOn: '2028-06-17',
    copyAssignments: true,
    copyTimetable: false,
    step: 'review',
    choices: [['s', 'leave']],
  };

  it('is read back as it was saved', () => {
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it('reopens at the review, never at the confirmation or the result', () => {
    expect(parseDraft(JSON.stringify({ ...draft, step: 'confirm' }))!.step).toBe('review');
    expect(parseDraft(JSON.stringify({ ...draft, step: 'result' }))!.step).toBe('review');
    expect(parseDraft(JSON.stringify({ ...draft, step: 'copy' }))!.step).toBe('copy');
  });

  it('ignores anything that is not a draft, and unknown actions', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft('[]')).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft, step: 'elsewhere' }))).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft, copyTimetable: 'yes' }))).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft, choices: [['s', 'fly'], ['t', 'repeat'], 7] }))!.choices).toEqual([['t', 'repeat']]);
  });
});

describe('groupsLine', () => {
  it('says what the groups do, and nothing when there are none', () => {
    expect(groupsLine([{ id: 'groups', create: 0 }])).toBeNull();
    expect(groupsLine([{ id: 'groups', create: 1 }, { id: 'group_members', create: 1 }, { id: 'group_slots', create: 0 }])).toBe(
      '1 groupe est copié dans les nouvelles classes : 1 élève promu retrouve son groupe.',
    );
    expect(groupsLine([{ id: 'groups', create: 4 }, { id: 'group_members', create: 12 }, { id: 'group_slots', create: 3 }])).toBe(
      '4 groupes sont copiés dans les nouvelles classes : 12 élèves promus retrouvent leur groupe, 3 séances de groupe sont copiées.',
    );
  });
});
