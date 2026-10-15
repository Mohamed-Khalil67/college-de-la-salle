import { gradeAnswers } from './grading';
import { isValidAccessCode, normalizeAccessCode } from './exam.contracts';

const questions = [
  { id: 'q1', prompt: '', options: ['a', 'b'], points: 1 },
  { id: 'q2', prompt: '', options: ['a', 'b', 'c'], points: 3 },
  { id: 'q3', prompt: '', options: ['a', 'b'], points: 2 },
];
const key = { q1: 0, q2: 2, q3: 1 };

describe('gradeAnswers', () => {
  it('awards points for exact matches only', () => {
    expect(gradeAnswers(questions, key, { q1: 0, q2: 1, q3: 1 })).toEqual({
      score: 3,
      maxScore: 6,
      correctCount: 2,
    });
  });

  it('scores unanswered and malformed answers as zero', () => {
    expect(gradeAnswers(questions, key, { q1: '0', q2: 2.0000001, ghost: 1 })).toEqual({
      score: 0,
      maxScore: 6,
      correctCount: 0,
    });
  });

  it('handles an empty submission', () => {
    expect(gradeAnswers(questions, key, {})).toEqual({ score: 0, maxScore: 6, correctCount: 0 });
  });
});

describe('access codes', () => {
  it('normalizes human input', () => {
    expect(normalizeAccessCode(' ab-c2 34 ')).toBe('ABC234');
  });

  it('rejects ambiguous characters and wrong lengths', () => {
    expect(isValidAccessCode('ABC234')).toBe(true);
    expect(isValidAccessCode('ABC0O1')).toBe(false);
    expect(isValidAccessCode('ABC23')).toBe(false);
  });
});
