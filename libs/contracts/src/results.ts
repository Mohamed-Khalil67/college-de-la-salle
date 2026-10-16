import type {
  AnswerValue,
  EpochMillis,
  ExamResult,
  GradingStatus,
  IntegrityReport,
  ManualGrade,
  Question,
  QuestionId,
  ScoringPolicy,
  SubmissionDraft,
  Uid,
  WrittenFeedback,
} from './exam.contracts';

/** Default for exams created before scoring policies existed. */
export const DEFAULT_SCORING: ScoringPolicy = { passPercent: null, resultRelease: 'ON_GRADED' };

/** Whether a candidate may now see their result. */
export function isResultReleased(
  scoring: ScoringPolicy | undefined,
  resultsPublished: boolean | undefined,
  gradingStatus: GradingStatus | null | undefined,
): boolean {
  if (gradingStatus !== 'GRADED') return false;
  const policy = scoring ?? DEFAULT_SCORING;
  return policy.resultRelease === 'ON_GRADED' || resultsPublished === true;
}

export function toPercent(score: number, maxScore: number): number {
  return maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
}

export interface ResultInput {
  readonly sessionId: string;
  readonly examId: string;
  readonly examOwnerId: Uid;
  readonly examTitle: string;
  readonly candidateId: Uid;
  readonly candidateName: string;
  readonly score: number;
  readonly maxScore: number;
  readonly scoring: ScoringPolicy | undefined;
  readonly questions: readonly Question[];
  readonly manualScores: Readonly<Record<QuestionId, Pick<ManualGrade, 'points' | 'feedback'>>>;
}

/** The candidate-facing view of a graded submission. Never contains the answer key. */
export function buildResult(input: ResultInput, publishedAt: EpochMillis): ExamResult {
  const scoring = input.scoring ?? DEFAULT_SCORING;
  const percent = toPercent(input.score, input.maxScore);
  const feedback: WrittenFeedback[] = [];
  input.questions.forEach((q, i) => {
    const grade = input.manualScores[q.id];
    if (q.type === 'TEXT' && grade) {
      feedback.push({
        questionNumber: i + 1,
        points: grade.points,
        maxPoints: q.points,
        feedback: grade.feedback ?? '',
      });
    }
  });
  return {
    sessionId: input.sessionId,
    examId: input.examId,
    examOwnerId: input.examOwnerId,
    examTitle: input.examTitle,
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    score: input.score,
    maxScore: input.maxScore,
    percent,
    passPercent: scoring.passPercent,
    passed: scoring.passPercent === null ? null : percent >= scoring.passPercent,
    feedback,
    publishedAt,
  };
}

export interface SessionForFinalize {
  readonly id: string;
  readonly examId: string;
  readonly examOwnerId: Uid;
  readonly candidateId: Uid;
  readonly candidateName: string;
  readonly expiresAt: EpochMillis;
}

export interface DraftForFinalize {
  readonly answers?: Readonly<Record<QuestionId, AnswerValue>>;
  readonly integrity?: IntegrityReport;
}

/**
 * Turns the last autosaved draft into a submission when the candidate's device never submitted.
 * Returns `null` when there is nothing worth submitting (no draft, or no answers in it).
 */
export function draftToSubmission(
  session: SessionForFinalize,
  draft: DraftForFinalize | null,
): SubmissionDraft | null {
  const answers = draft?.answers ?? {};
  if (!draft || Object.keys(answers).length === 0) return null;
  return {
    sessionId: session.id,
    examId: session.examId,
    examOwnerId: session.examOwnerId,
    candidateId: session.candidateId,
    candidateName: session.candidateName,
    answers,
    integrity: draft.integrity ?? { visibilityLossCount: 0, hiddenMs: 0 },
    completedBy: 'SERVER_DRAFT',
    expiresAt: session.expiresAt,
  };
}

/** A question counts as answered once it has an option or non-blank text. */
export function isAnswered(value: AnswerValue | undefined): boolean {
  return typeof value === 'number' || (typeof value === 'string' && value.trim().length > 0);
}

export function countAnswered(answers: Readonly<Record<QuestionId, AnswerValue>>): number {
  return Object.values(answers).filter(isAnswered).length;
}
