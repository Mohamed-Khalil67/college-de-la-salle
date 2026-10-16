import type {
  AnswerKey,
  GradeResult,
  GradingStatus,
  ManualGrade,
  Question,
  QuestionId,
} from './exam.contracts';

/**
 * Pure, deterministic automatic grader. Runs server-side only (Cloud Function), because the answer
 * key is never readable by candidates. Scores CHOICE questions; TEXT questions are reported in
 * `pendingReview` for a human. Unknown question ids and malformed answers score zero.
 */
export function gradeAnswers(
  questions: readonly Question[],
  answerKey: AnswerKey,
  answers: Readonly<Record<QuestionId, unknown>>,
): GradeResult {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  const pendingReview: QuestionId[] = [];

  for (const question of questions) {
    maxScore += question.points;
    if (question.type === 'TEXT') {
      pendingReview.push(question.id);
      continue;
    }
    const expected = answerKey[question.id];
    const given = answers[question.id];
    if (Number.isInteger(given) && given === expected) {
      score += question.points;
      correctCount += 1;
    }
  }

  return { score, maxScore, correctCount, pendingReview };
}

export interface FinalTotals {
  readonly gradingStatus: GradingStatus;
  readonly pendingReview: readonly QuestionId[];
  /** Final total, or `null` while any written answer is still ungraded. */
  readonly score: number | null;
}

/** Combines the automatic pass with the examiner's manual grades into the final result. */
export function finalizeScore(
  questions: readonly Question[],
  autoScore: number,
  manualScores: Readonly<Record<QuestionId, Pick<ManualGrade, 'points'>>>,
): FinalTotals {
  let manualTotal = 0;
  const pendingReview: QuestionId[] = [];
  for (const question of questions) {
    if (question.type !== 'TEXT') continue;
    const grade = manualScores[question.id];
    if (grade) manualTotal += grade.points;
    else pendingReview.push(question.id);
  }
  return pendingReview.length
    ? { gradingStatus: 'NEEDS_REVIEW', pendingReview, score: null }
    : { gradingStatus: 'GRADED', pendingReview, score: autoScore + manualTotal };
}

/** Manual points must be whole or half points within [0, question.points]. */
export function isValidManualPoints(points: unknown, max: number): points is number {
  return (
    typeof points === 'number' &&
    Number.isFinite(points) &&
    points >= 0 &&
    points <= max &&
    Number.isInteger(points * 2)
  );
}
