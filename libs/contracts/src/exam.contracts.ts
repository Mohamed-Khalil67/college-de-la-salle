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

export type QuestionType = 'CHOICE' | 'TEXT';

interface QuestionBase {
  readonly id: QuestionId;
  readonly prompt: string;
  readonly points: number;
}

/** Single-answer multiple choice. Graded automatically against the answer key. */
export interface ChoiceQuestion extends QuestionBase {
  readonly type: 'CHOICE';
  readonly options: readonly string[];
}

/** Written answer. Graded by the examiner, optionally with an AI suggestion first. */
export interface TextQuestion extends QuestionBase {
  readonly type: 'TEXT';
  readonly maxLength: number;
}

export type Question = ChoiceQuestion | TextQuestion;

/** Correct option index per CHOICE question. Never leaves `exams/{id}/private/answerKey`. */
export type AnswerKey = Readonly<Record<QuestionId, number>>;

/** Grading guidance per TEXT question. Lives next to the answer key, equally private. */
export interface TextRubric {
  /** What a full-marks answer looks like. Optional. */
  readonly modelAnswer: string;
  /** How to award points, e.g. "1 pt: names consensus; 2 pts: explains leader terms". */
  readonly criteria: string;
}
export type TextRubrics = Readonly<Record<QuestionId, TextRubric>>;

/** A candidate's answer: option index for CHOICE, free text for TEXT. */
export type AnswerValue = number | string;

/**
 * Documents written before question types existed have no `type`; they are multiple choice.
 * Every reader of stored questions goes through this.
 */
export function normalizeQuestion(raw: Question | (Omit<ChoiceQuestion, 'type'> & { type?: undefined })): Question {
  return raw.type ? raw : { ...raw, type: 'CHOICE' };
}

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
  readonly rubrics: TextRubrics;
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

export type ExamMeta = Omit<ExamDefinition, 'questions' | 'answerKey' | 'rubrics'> & {
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
  readonly rubrics: TextRubrics;
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
  readonly answers: Readonly<Record<QuestionId, AnswerValue>>;
  readonly integrity: IntegrityReport;
  readonly completedBy: CompletionReason;
  /** Copied from the session; rules pin it to the session's value. */
  readonly expiresAt: EpochMillis;
}

/** Result of the automatic pass: CHOICE questions only. */
export interface GradeResult {
  /** Points earned on auto-graded (CHOICE) questions. */
  readonly score: number;
  /** Points available across ALL questions, written ones included. */
  readonly maxScore: number;
  readonly correctCount: number;
  /** TEXT questions that a human must grade before the score is final. */
  readonly pendingReview: readonly QuestionId[];
}

/**
 * `NEEDS_REVIEW`: auto pass done, written answers still to be graded by the examiner.
 * `GRADED`: every question has points; `score` is final.
 */
export type GradingStatus = 'NEEDS_REVIEW' | 'GRADED';

export interface ManualGrade {
  readonly points: number;
  readonly feedback: string;
  /** `AI_ACCEPTED` when the examiner kept the AI suggestion as-is. */
  readonly source: 'MANUAL' | 'AI_ACCEPTED';
  readonly gradedBy: Uid;
  readonly gradedAt: EpochMillis;
}

/** Advisory only. An AI suggestion never changes a score until the examiner confirms it. */
export interface AiSuggestion {
  readonly points: number;
  readonly rationale: string;
  readonly model: string;
  readonly createdAt: EpochMillis;
}

export interface Submission extends SubmissionDraft {
  readonly id: string;
  /** Server receipt time (`request.time`), the completion timestamp. */
  readonly submittedAt: EpochMillis;
  /** `null` until the automatic grader has run. */
  readonly gradingStatus: GradingStatus | null;
  /** Points from auto-graded questions. */
  readonly autoScore: number | null;
  readonly manualScores: Readonly<Record<QuestionId, ManualGrade>>;
  readonly aiSuggestions: Readonly<Record<QuestionId, AiSuggestion>>;
  readonly pendingReview: readonly QuestionId[];
  /** Final total — only set once `gradingStatus === 'GRADED'`. */
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly gradedAt: EpochMillis | null;
}

/** Fields only the server may write onto a submission. */
export const SERVER_ONLY_SUBMISSION_FIELDS = [
  'gradingStatus',
  'autoScore',
  'manualScores',
  'aiSuggestions',
  'pendingReview',
  'score',
  'maxScore',
  'correctCount',
  'gradedAt',
] as const;

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

/** Examiner-only. Records the authoritative points for one written answer. */
export interface GradeTextAnswerRequest {
  readonly sessionId: string;
  readonly questionId: QuestionId;
  readonly points: number;
  readonly feedback: string;
  readonly source: ManualGrade['source'];
}

export interface GradeTextAnswerResponse {
  readonly gradingStatus: GradingStatus;
  readonly score: number | null;
}

/** Examiner-only. Asks the AI grader for a suggestion; stores and returns it, changes no score. */
export interface SuggestTextGradeRequest {
  readonly sessionId: string;
  readonly questionId: QuestionId;
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
  defaultTextAnswerLength: 2_000,
  maxTextAnswerLength: 10_000,
  maxFeedbackLength: 2_000,
  maxRubricLength: 4_000,
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
