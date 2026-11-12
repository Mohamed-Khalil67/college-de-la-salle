import { describe, expect, it } from 'vitest';
import type { ActivityTypeDto, PendingGradingDto, TeachingAssignmentDto } from '@cdls/shared';
import { changedSince, classSubjectChoices, initialChoice, pendingMeta, quickGradeTypes, saveStatus, scaleLine } from './noter-logic';

const type = (id: string, flags: Partial<ActivityTypeDto>): ActivityTypeDto => ({
  id,
  code: id,
  label: id,
  colour: 'navy',
  icon: 'book',
  gradable: false,
  repeatable: false,
  homework: false,
  isSystem: true,
  ownerTeacherId: null,
  ownerName: null,
  archived: false,
  ...flags,
});

const assignment = (classId: string, classLabel: string, subjectId: string, subjectName: string): TeachingAssignmentDto =>
  ({ id: `${classId}-${subjectId}`, classId, classLabel, subjectId, subjectName, coefficient: 1 }) as TeachingAssignmentDto;

describe('quickGradeTypes', () => {
  it('keeps graded, non-homework, active types, exams and tests first', () => {
    const list = quickGradeTypes([
      type('tp', { gradable: true, repeatable: true }),
      type('cours', { repeatable: true }),
      type('devoir', { gradable: true, homework: true }),
      type('examen', { gradable: true }),
      type('vieux', { gradable: true, archived: true }),
    ]);
    expect(list.map((t) => t.id)).toEqual(['examen', 'tp']);
  });
});

describe('class and subject choices', () => {
  const choices = classSubjectChoices([
    assignment('c2', 'Terminale', 'maths', 'Mathématiques'),
    assignment('c1', 'Première', 'maths', 'Mathématiques'),
    assignment('c1', 'Première', 'nsi', 'NSI'),
    assignment('c1', 'Première', 'maths', 'Mathématiques'),
  ]);

  it('lists each class and subject once, sorted', () => {
    expect(choices.map((c) => c.label)).toEqual(['Première, Mathématiques', 'Première, NSI', 'Terminale, Mathématiques']);
  });

  it('starts from the query parameters, the class alone, or the first choice', () => {
    expect(initialChoice(choices, 'c1', 'nsi')?.label).toBe('Première, NSI');
    expect(initialChoice(choices, 'c2', undefined)?.label).toBe('Terminale, Mathématiques');
    expect(initialChoice(choices, 'inconnue', 'x')?.label).toBe('Première, Mathématiques');
    expect(initialChoice([], undefined, undefined)).toBeUndefined();
  });
});

describe('pendingMeta', () => {
  const pending = (entered: number, published: boolean) =>
    ({
      event: { type: { label: 'Contrôle' }, date: '2026-11-12' },
      entered,
      total: 27,
      published,
      outOf: null,
    }) as unknown as PendingGradingDto;

  it('says the type, the day, how many marks and the state', () => {
    expect(pendingMeta(pending(0, false))).toBe('Contrôle, jeudi 12 novembre, aucune note saisie, brouillon');
    expect(pendingMeta(pending(1, false))).toMatch(/1 note sur 27, brouillon$/);
    expect(pendingMeta(pending(18, true))).toMatch(/18 notes sur 27, publiée en partie$/);
  });
});

describe('saveStatus', () => {
  const base = { saving: false, dirty: false, invalid: false, failed: false, entered: 4, total: 27, average: 14.2 };

  it('reads « Enregistré · 4 / 27 · moyenne 14,2 » once saved', () => {
    expect(saveStatus(base)).toBe('Enregistré · 4 / 27 · moyenne 14,2');
  });

  it('says when it saves, waits, failed or cannot save', () => {
    expect(saveStatus({ ...base, saving: true })).toBe('Enregistrement… · 4 / 27');
    expect(saveStatus({ ...base, dirty: true })).toBe('Modifications en attente · 4 / 27 · moyenne 14,2');
    expect(saveStatus({ ...base, failed: true })).toBe('Non enregistré · 4 / 27');
    expect(saveStatus({ ...base, invalid: true, saving: true })).toMatch(/^Note hors barème/);
  });

  it('leaves the average out before the first mark', () => {
    expect(saveStatus({ ...base, entered: 0, average: null })).toBe('Enregistré · 0 / 27');
  });
});

describe('changedSince', () => {
  it('keeps only what was typed after the values were sent', () => {
    expect(changedSince({ a: 12, b: null, c: 5 }, { a: 12, b: 14, c: null, d: 3 })).toEqual({ b: 14, c: null, d: 3 });
    expect(changedSince({ a: 'x' }, { a: 'x' })).toEqual({});
  });
});

describe('scaleLine', () => {
  it('formats the scale and the coefficient with a decimal comma', () => {
    expect(scaleLine(10, 1.5)).toBe('Sur 10, coefficient 1,5');
  });
});
