import type { Question } from './exam.contracts';
import {
  buildResult,
  countAnswered,
  draftToSubmission,
  isResultReleased,
  toPercent,
} from './results';

const questions: Question[] = [
  { id: 'q1', type: 'CHOICE', prompt: '', options: ['a', 'b'], points: 1 },
  { id: 'q2', type: 'TEXT', prompt: '', points: 5, maxLength: 100 },
];

describe('result release policy', () => {
  it('never releases before grading is complete', () => {
    expect(isResultReleased({ passPercent: 50, resultRelease: 'ON_GRADED' }, false, 'NEEDS_REVIEW')).toBe(false);
    expect(isResultReleased({ passPercent: 50, resultRelease: 'ON_GRADED' }, true, null)).toBe(false);
  });

  it('ON_GRADED releases as soon as grading completes', () => {
    expect(isResultReleased({ passPercent: 50, resultRelease: 'ON_GRADED' }, false, 'GRADED')).toBe(true);
  });

  it('MANUAL waits for the examiner to publish', () => {
    const manual = { passPercent: 50, resultRelease: 'MANUAL' } as const;
    expect(isResultReleased(manual, false, 'GRADED')).toBe(false);
    expect(isResultReleased(manual, true, 'GRADED')).toBe(true);
  });

  it('exams without a policy (created earlier) release on grading', () => {
    expect(isResultReleased(undefined, undefined, 'GRADED')).toBe(true);
  });
});

describe('buildResult', () => {
  const base = {
    sessionId: 's1',
    examId: 'e1',
    examOwnerId: 'owner',
    examTitle: 'اختبار',
    candidateId: 'c1',
    candidateName: 'سارة',
    questions,
    manualScores: { q2: { points: 4, feedback: 'أحسنت' } },
  };

  it('computes percent and the pass verdict against the pass mark', () => {
    const result = buildResult(
      { ...base, score: 5, maxScore: 6, scoring: { passPercent: 60, resultRelease: 'ON_GRADED' } },
      1000,
    );
    expect(result.percent).toBe(83.3);
    expect(result.passed).toBe(true);
    expect(result.feedback).toEqual([{ questionNumber: 2, points: 4, maxPoints: 5, feedback: 'أحسنت' }]);
  });

  it('fails below the pass mark and gives no verdict without one', () => {
    const failing = buildResult(
      { ...base, score: 2, maxScore: 6, scoring: { passPercent: 60, resultRelease: 'ON_GRADED' } },
      0,
    );
    expect(failing.passed).toBe(false);
    const noMark = buildResult(
      { ...base, score: 2, maxScore: 6, scoring: { passPercent: null, resultRelease: 'ON_GRADED' } },
      0,
    );
    expect(noMark.passed).toBeNull();
  });

  it('passes exactly at the mark', () => {
    expect(toPercent(3, 5)).toBe(60);
    const atMark = buildResult(
      { ...base, score: 3, maxScore: 5, scoring: { passPercent: 60, resultRelease: 'ON_GRADED' } },
      0,
    );
    expect(atMark.passed).toBe(true);
  });
});

describe('draftToSubmission (device never submitted)', () => {
  const session = {
    id: 's1',
    examId: 'e1',
    examOwnerId: 'owner',
    candidateId: 'c1',
    candidateName: 'سارة',
    expiresAt: 5000,
  };

  it('turns the last autosaved draft into a SERVER_DRAFT submission', () => {
    const sub = draftToSubmission(session, {
      answers: { q1: 1, q2: 'نص' },
      integrity: { visibilityLossCount: 2, hiddenMs: 300 },
    });
    expect(sub).toEqual({
      sessionId: 's1',
      examId: 'e1',
      examOwnerId: 'owner',
      candidateId: 'c1',
      candidateName: 'سارة',
      answers: { q1: 1, q2: 'نص' },
      integrity: { visibilityLossCount: 2, hiddenMs: 300 },
      completedBy: 'SERVER_DRAFT',
      expiresAt: 5000,
    });
  });

  it('submits nothing when there is no draft or it is empty', () => {
    expect(draftToSubmission(session, null)).toBeNull();
    expect(draftToSubmission(session, { answers: {} })).toBeNull();
  });
});

describe('countAnswered', () => {
  it('ignores blank text', () => {
    expect(countAnswered({ q1: 0, q2: '  ', q3: 'x' })).toBe(2);
  });
});
