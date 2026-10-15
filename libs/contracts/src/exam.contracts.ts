/**
 * Authoritative schema contracts shared by the Angular client and Cloud Functions.
 *
 * This file MUST stay dependency-free (no Firebase / Angular imports): it is copied verbatim into
 * `functions/src/contracts/` at build time. All instants are epoch milliseconds in the domain model;
 * the Firestore converters in `data-access-exams` (client) and `functions/` (server) map them to and
 * from Firestore `Timestamp`s.
 */

export type EpochMillis = number;
export type QuestionId = string;
export type Uid = string;

/* ------------------------------------------------------------------------------------------------
 * ExamDefinition — the complete, authoritative exam as authored by an examiner.
 * ---------------------------------------------------------------------------------------------- */

export interface Question {
  readonly id: QuestionId;
  readonly prompt: string;
  readonly options: readonly string[];
  readonly points: number;
}

/** Correct option index per question. Never leaves `exams/{id}/private/answerKey`. */
export type AnswerKey = Readonly<Record<QuestionId, number>>;

export interface ExamWindow {
  readonly opensAt: EpochMillis;
  readonly closesAt: EpochMillis;
}

export interface IntegrityPolicy {
  /** Auto-submit once the tab loses visibility more than this many times. `null` = record only. */
  readonly maxVisibilityLosses: number | null;
}

export interface ExamDefinition {
  readonly id: string;
  readonly ownerId: Uid;
  readonly title: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly window: ExamWindow;
  readonly accessCode: string;
  readonly integrity: IntegrityPolicy;
  readonly questions: readonly Question[];
  readonly answerKey: AnswerKey;
  readonly createdAt: EpochMillis;
}

/*
 * Physical storage split. Firestore rules authorize whole documents, never individual fields, so
 * the definition is partitioned by audience:
 *
 *   exams/{examId}                    ExamMetaDoc     owner only
 *   exams/{examId}/paper/current      ExamPaperDoc    owner + candidate holding a LIVE session
 *   exams/{examId}/private/answerKey  AnswerKeyDoc    owner only (and the grader, via Admin SDK)
 *   accessCodes/{code}                AccessCodeDoc   any signed-in user, by exact code (no list)
 */

export type ExamMeta = Omit<ExamDefinition, 'questions' | 'answerKey'> & {
  readonly questionCount: number;
  readonly maxScore: number;
};

export interface ExamPaper {
  readonly ownerId: Uid;
  readonly questions: readonly Question[];
}

export interface AnswerKeyRecord {
  readonly ownerId: Uid;
  readonly answers: AnswerKey;
}

/** Public lobby card resolved from a shareable code. Contains nothing a candidate could exploit. */
export interface AccessCodeRecord {
  readonly code: string;
  readonly examId: string;
  readonly ownerId: Uid;
  readonly title: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly questionCount: number;
  readonly window: ExamWindow;
}

/* ------------------------------------------------------------------------------------------------
 * ExamSession — minted exclusively by the `startSession` callable (Admin SDK).
 * Clients can never create or modify it, so the timer cannot be tampered with.
 * ---------------------------------------------------------------------------------------------- */

export type ExamSessionStatus = 'NOT_STARTED' | 'ACTIVE' | 'EXPIRED' | 'SUBMITTED';

export interface ExamSession {
  /** Deterministic: one attempt per candidate per exam. See {@link sessionIdFor}. */
  readonly id: string;
  readonly examId: string;
  readonly examOwnerId: Uid;
  readonly examTitle: string;
  readonly candidateId: Uid;
  readonly candidateName: string;
  readonly startedAt: EpochMillis;
  readonly expiresAt: EpochMillis;
  readonly status: ExamSessionStatus;
  readonly integrity: IntegrityPolicy;
  readonly submittedAt: EpochMillis | null;
}

/* ------------------------------------------------------------------------------------------------
 * Submission — created once by the candidate before `expiresAt`; graded by the server.
 * ---------------------------------------------------------------------------------------------- */

export type CompletionReason = 'CANDIDATE' | 'AUTO_TIMER' | 'AUTO_INTEGRITY';

export interface IntegrityReport {
  readonly visibilityLossCount: number;
  readonly hiddenMs: number;
}

/** Fields a candidate is allowed to write. Must match the `hasOnly` list in firestore.rules. */
export interface SubmissionDraft {
  readonly sessionId: string;
  readonly examId: string;
  readonly examOwnerId: Uid;
  readonly candidateId: Uid;
  readonly candidateName: string;
  readonly answers: Readonly<Record<QuestionId, number>>;
  readonly integrity: IntegrityReport;
  readonly completedBy: CompletionReason;
  /** Copied from the session; rules pin it to the session's value. */
  readonly expiresAt: EpochMillis;
}

export interface GradeResult {
  readonly score: number;
  readonly maxScore: number;
  readonly correctCount: number;
}

export interface Submission extends SubmissionDraft {
  readonly id: string;
  /** Server receipt time (`request.time`), the completion timestamp. */
  readonly submittedAt: EpochMillis;
  /** Written only by the grader. `null` while grading is pending. */
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly gradedAt: EpochMillis | null;
}

/** Fields only the server may write onto a submission. */
export const SERVER_ONLY_SUBMISSION_FIELDS = ['score', 'maxScore', 'correctCount', 'gradedAt'] as const;

/* ------------------------------------------------------------------------------------------------
 * Callable contracts
 * ---------------------------------------------------------------------------------------------- */

export interface StartSessionRequest {
  readonly accessCode: string;
  readonly candidateName: string;
}

export interface StartSessionResponse {
  readonly session: ExamSession;
  /** Server clock at response time, used by the client to compute its clock offset. */
  readonly serverNow: EpochMillis;
}

/* ------------------------------------------------------------------------------------------------
 * Shared constants & pure helpers
 * ---------------------------------------------------------------------------------------------- */

export const COLLECTIONS = {
  exams: 'exams',
  paper: 'paper',
  private: 'private',
  accessCodes: 'accessCodes',
  sessions: 'sessions',
  submissions: 'submissions',
} as const;

export const PAPER_DOC_ID = 'current';
export const ANSWER_KEY_DOC_ID = 'answerKey';

export const LIMITS = {
  minDurationSeconds: 60,
  maxDurationSeconds: 4 * 60 * 60,
  maxQuestions: 100,
  minOptions: 2,
  maxOptions: 8,
  maxCandidateNameLength: 80,
  accessCodeLength: 6,
} as const;

/**
 * The client dispatches its auto-submit this long before `expiresAt` so the write reaches Firestore
 * before the rules' strict `request.time <= expiresAt` check closes the door.
 */
export const AUTO_SUBMIT_LEAD_MS = 2_500;

/** Unambiguous alphabet (no 0/O, 1/I/L) for human-typed access codes. */
export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function sessionIdFor(examId: string, candidateId: Uid): string {
  return `${examId}_${candidateId}`;
}

export function normalizeAccessCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidAccessCode(code: string): boolean {
  if (code.length !== LIMITS.accessCodeLength) return false;
  return [...code].every((ch) => ACCESS_CODE_ALPHABET.includes(ch));
}
