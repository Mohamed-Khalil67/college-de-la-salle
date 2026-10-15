import type { AnswerKey, GradeResult, Question, QuestionId } from './exam.contracts';

/**
 * Pure, deterministic grader. Runs server-side only (Cloud Function), because the answer key is
 * never readable by candidates. Unknown question ids and malformed answers score zero.
 */
export function gradeAnswers(
  questions: readonly Question[],
  answerKey: AnswerKey,
  answers: Readonly<Record<QuestionId, unknown>>,
): GradeResult {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;

  for (const question of questions) {
    maxScore += question.points;
    const expected = answerKey[question.id];
    const given = answers[question.id];
    if (Number.isInteger(given) && given === expected) {
      score += question.points;
      correctCount += 1;
    }
  }

  return { score, maxScore, correctCount };
}
