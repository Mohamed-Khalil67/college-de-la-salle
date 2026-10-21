import type { ClassSubjectDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import {
  classSubjectTotals,
  COEFFICIENT_RULE,
  copyMessage,
  copySummary,
  decimalProblem,
  formatDecimal,
  HOURS_RULE,
  parseDecimal,
} from './class-subject-values';

function row(subjectId: string, coefficient: number, hoursPerWeek: number | null): ClassSubjectDto {
  return { id: subjectId, classId: 'c', subjectId, subjectName: subjectId, coefficient, hoursPerWeek, teachers: [] };
}

describe('parseDecimal and formatDecimal', () => {
  it('reads a decimal comma or point', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal(' 2 ')).toBe(2);
    expect(parseDecimal('0.25')).toBe(0.25);
  });

  it('refuses text, negatives and empty values', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('-1')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });

  it('writes a decimal comma', () => {
    expect(formatDecimal(1.5)).toBe('1,5');
    expect(formatDecimal(3)).toBe('3');
    expect(formatDecimal(null)).toBe('');
  });
});

describe('decimalProblem', () => {
  it('requires the coefficient but not the hours', () => {
    expect(decimalProblem('', COEFFICIENT_RULE)).toContain('obligatoire');
    expect(decimalProblem('', HOURS_RULE)).toBeNull();
  });

  it('explains how to fix a wrong value', () => {
    expect(decimalProblem('beaucoup', COEFFICIENT_RULE)).toContain('un nombre');
    expect(decimalProblem('21', COEFFICIENT_RULE)).toContain('20');
    expect(decimalProblem('41', HOURS_RULE)).toContain('40');
    expect(decimalProblem('1,234', COEFFICIENT_RULE)).toContain('deux décimales');
  });

  it('accepts valid values', () => {
    expect(decimalProblem('0', COEFFICIENT_RULE)).toBeNull();
    expect(decimalProblem('1,25', COEFFICIENT_RULE)).toBeNull();
    expect(decimalProblem('4', HOURS_RULE)).toBeNull();
  });
});

describe('classSubjectTotals', () => {
  it('adds coefficients and hours without float noise', () => {
    expect(classSubjectTotals([row('a', 0.1, 1.1), row('b', 0.2, null), row('c', 3, 2)])).toEqual({ count: 3, coefficient: 3.3, hours: 3.1 });
  });

  it('has no hours when none is set', () => {
    expect(classSubjectTotals([row('a', 1, null)]).hours).toBeNull();
    expect(classSubjectTotals([])).toEqual({ count: 0, coefficient: 0, hours: null });
  });
});

describe('copySummary and copyMessage', () => {
  it('counts added and aligned subjects', () => {
    const before = [row('maths', 4, 5), row('arabe', 2, 3)];
    const after = [row('maths', 5, 5), row('arabe', 2, 3), row('svt', 2, 2)];
    expect(copySummary(before, after)).toEqual({ added: 1, updated: 1 });
  });

  it('says it in French', () => {
    expect(copyMessage({ added: 2, updated: 1 }, 'Seconde A')).toBe(
      'Copié depuis Seconde A : 2 matières ajoutées, 1 matière mise à jour. Les enseignants ne sont pas copiés.',
    );
    expect(copyMessage({ added: 0, updated: 0 }, 'Seconde A')).toContain('rien n’a changé');
  });
});
