import {
  type AccessCodeRecord,
  AUTO_SUBMIT_LEAD_MS,
  type CompletionReason,
  type EpochMillis,
  type ExamPaper,
  type AnswerValue,
  type ExamSession,
  type IntegrityReport,
  type QuestionId,
  type SubmissionDraft,
} from '@exam/contracts';

/*
 * Explicit finite-state machine for the exam-taking surface.
 *
 *   LOADING ──LOBBY_LOADED──▶ LOBBY ──START_REQUESTED──▶ STARTING ──SESSION_OPENED──▶ ACTIVE
 *      │                       ▲  │                         │                          │
 *      └──LOBBY_FAILED─▶ FAILED│  └───────START_FAILED──────┘                          │
 *                              │                            └─SESSION_CLOSED─▶ SUBMITTED/EXPIRED
 *                                                                                      │
 *   ACTIVE ──TICK (remaining ≤ lead) / VISIBILITY (policy breach) / SUBMIT_REQUESTED──▶ SUBMITTING
 *   SUBMITTING ──SUBMIT_SUCCEEDED──▶ SUBMITTED
 *   SUBMITTING ──SUBMIT_FAILED──▶ ACTIVE (deadline not passed: retry) | EXPIRED (deadline passed)
 *
 * The reducer is pure and total: `(state, event) → state`. Unknown events in a phase are ignored.
 * Every time-dependent decision reads `now` from the event, so the machine is fully deterministic
 * under test; the store feeds it server-calibrated time.
 */

export interface IntegrityTracker extends IntegrityReport {
  /** Server-time instant the tab became hidden, or `null` while visible. */
  readonly hiddenSince: EpochMillis | null;
}

export interface ActiveContext {
  readonly session: ExamSession;
  readonly paper: ExamPaper;
  readonly answers: Readonly<Record<QuestionId, AnswerValue>>;
  readonly now: EpochMillis;
  readonly integrity: IntegrityTracker;
  readonly lastError: string | null;
}

export type RunnerState =
  | { readonly phase: 'LOADING' }
  | { readonly phase: 'FAILED'; readonly message: string }
  | { readonly phase: 'LOBBY'; readonly lobby: AccessCodeRecord; readonly error: string | null }
  | { readonly phase: 'STARTING'; readonly lobby: AccessCodeRecord; readonly candidateName: string }
  | { readonly phase: 'ACTIVE'; readonly ctx: ActiveContext }
  | { readonly phase: 'SUBMITTING'; readonly ctx: ActiveContext; readonly reason: CompletionReason }
  | {
      readonly phase: 'SUBMITTED';
      readonly session: ExamSession;
      readonly reason: CompletionReason | null;
    }
  | { readonly phase: 'EXPIRED'; readonly session: ExamSession; readonly message: string };

export type RunnerPhase = RunnerState['phase'];

export type RunnerEvent =
  | { readonly type: 'LOBBY_LOADED'; readonly lobby: AccessCodeRecord }
  | { readonly type: 'LOBBY_FAILED'; readonly message: string }
  | { readonly type: 'START_REQUESTED'; readonly candidateName: string }
  | { readonly type: 'START_FAILED'; readonly message: string }
  | {
      readonly type: 'SESSION_OPENED';
      readonly session: ExamSession;
      readonly paper: ExamPaper;
      readonly now: EpochMillis;
      readonly restoredAnswers: Readonly<Record<QuestionId, unknown>>;
    }
  | { readonly type: 'SESSION_CLOSED'; readonly session: ExamSession }
  | { readonly type: 'ANSWER_SELECTED'; readonly questionId: QuestionId; readonly option: number }
  | { readonly type: 'ANSWER_TYPED'; readonly questionId: QuestionId; readonly text: string }
  | { readonly type: 'TICK'; readonly now: EpochMillis }
  | { readonly type: 'VISIBILITY_CHANGED'; readonly hidden: boolean; readonly now: EpochMillis }
  | { readonly type: 'SUBMIT_REQUESTED' }
  | { readonly type: 'SUBMIT_SUCCEEDED' }
  | { readonly type: 'SUBMIT_FAILED'; readonly message: string; readonly now: EpochMillis };

export const initialRunnerState: RunnerState = { phase: 'LOADING' };

export function transition(state: RunnerState, event: RunnerEvent): RunnerState {
  switch (state.phase) {
    case 'LOADING':
      if (event.type === 'LOBBY_LOADED') return { phase: 'LOBBY', lobby: event.lobby, error: null };
      if (event.type === 'LOBBY_FAILED') return { phase: 'FAILED', message: event.message };
      return state;

    case 'LOBBY':
      if (event.type === 'START_REQUESTED') {
        return { phase: 'STARTING', lobby: state.lobby, candidateName: event.candidateName };
      }
      return state;

    case 'STARTING':
      switch (event.type) {
        case 'START_FAILED':
          return { phase: 'LOBBY', lobby: state.lobby, error: event.message };
        case 'SESSION_OPENED':
          return guardDeadline({
            phase: 'ACTIVE',
            ctx: {
              session: event.session,
              paper: event.paper,
              answers: sanitizeAnswers(event.restoredAnswers, event.paper),
              now: event.now,
              integrity: { visibilityLossCount: 0, hiddenMs: 0, hiddenSince: null },
              lastError: null,
            },
          });
        case 'SESSION_CLOSED':
          return closedSession(event.session);
        default:
          return state;
      }

    case 'ACTIVE': {
      const { ctx } = state;
      switch (event.type) {
        case 'ANSWER_SELECTED': {
          const question = ctx.paper.questions.find((q) => q.id === event.questionId);
          if (question?.type !== 'CHOICE') return state;
          if (event.option < 0 || event.option >= question.options.length) return state;
          return withAnswer(state.ctx, event.questionId, event.option);
        }
        case 'ANSWER_TYPED': {
          const question = ctx.paper.questions.find((q) => q.id === event.questionId);
          if (question?.type !== 'TEXT') return state;
          return withAnswer(state.ctx, event.questionId, event.text.slice(0, question.maxLength));
        }
        case 'TICK':
          return guardDeadline({ phase: 'ACTIVE', ctx: { ...ctx, now: event.now } });
        case 'VISIBILITY_CHANGED':
          return guardDeadline(onVisibility(ctx, event.hidden, event.now));
        case 'SUBMIT_REQUESTED':
          return { phase: 'SUBMITTING', ctx, reason: 'CANDIDATE' };
        default:
          return state;
      }
    }

    case 'SUBMITTING':
      switch (event.type) {
        case 'TICK':
          return { ...state, ctx: { ...state.ctx, now: event.now } };
        case 'VISIBILITY_CHANGED':
          // Keep integrity accounting accurate, but never re-enter the auto-submit branch.
          return { ...state, ctx: trackVisibility(state.ctx, event.hidden, event.now) };
        case 'SUBMIT_SUCCEEDED':
          return { phase: 'SUBMITTED', session: state.ctx.session, reason: state.reason };
        case 'SUBMIT_FAILED': {
          const ctx = { ...state.ctx, now: event.now, lastError: event.message };
          if (event.now > ctx.session.expiresAt) {
            return {
              phase: 'EXPIRED',
              session: ctx.session,
              message: 'انتهى الوقت قبل أن تُسجَّل إجاباتك.',
            };
          }
          // Still inside the window: back to ACTIVE. If we are in the auto-submit lead zone the
          // next TICK immediately retries; otherwise the candidate can retry manually.
          return { phase: 'ACTIVE', ctx };
        }
        default:
          return state;
      }

    case 'FAILED':
    case 'SUBMITTED':
    case 'EXPIRED':
      return state; // terminal
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Selectors                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export function remainingMs(ctx: ActiveContext): number {
  return Math.max(0, ctx.session.expiresAt - ctx.now);
}

export function toSubmissionDraft(ctx: ActiveContext, reason: CompletionReason): SubmissionDraft {
  const { session, integrity } = ctx;
  const hiddenMs =
    integrity.hiddenMs + (integrity.hiddenSince === null ? 0 : ctx.now - integrity.hiddenSince);
  return {
    sessionId: session.id,
    examId: session.examId,
    examOwnerId: session.examOwnerId,
    candidateId: session.candidateId,
    candidateName: session.candidateName,
    answers: ctx.answers,
    integrity: {
      visibilityLossCount: integrity.visibilityLossCount,
      hiddenMs: Math.max(0, Math.round(hiddenMs)),
    },
    completedBy: reason,
    expiresAt: session.expiresAt,
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* Internals                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

/** Auto-submit once inside the lead window. Pure function of (expiresAt, now). */
function guardDeadline(state: RunnerState): RunnerState {
  if (state.phase !== 'ACTIVE') return state;
  const { ctx } = state;
  if (ctx.session.expiresAt - ctx.now <= AUTO_SUBMIT_LEAD_MS) {
    return { phase: 'SUBMITTING', ctx, reason: 'AUTO_TIMER' };
  }
  return state;
}

function onVisibility(
  ctx: ActiveContext,
  hidden: boolean,
  now: EpochMillis,
): RunnerState {
  const next = trackVisibility({ ...ctx, now }, hidden, now);
  const limit = ctx.session.integrity?.maxVisibilityLosses ?? null;
  if (hidden && limit !== null && next.integrity.visibilityLossCount > limit) {
    return { phase: 'SUBMITTING', ctx: next, reason: 'AUTO_INTEGRITY' };
  }
  return { phase: 'ACTIVE', ctx: next };
}

function trackVisibility(ctx: ActiveContext, hidden: boolean, now: EpochMillis): ActiveContext {
  const { integrity } = ctx;
  if (hidden) {
    if (integrity.hiddenSince !== null) return ctx; // duplicate event
    return {
      ...ctx,
      integrity: {
        ...integrity,
        visibilityLossCount: integrity.visibilityLossCount + 1,
        hiddenSince: now,
      },
    };
  }
  if (integrity.hiddenSince === null) return ctx;
  return {
    ...ctx,
    integrity: {
      ...integrity,
      hiddenMs: integrity.hiddenMs + Math.max(0, now - integrity.hiddenSince),
      hiddenSince: null,
    },
  };
}

function closedSession(session: ExamSession): RunnerState {
  if (session.status === 'SUBMITTED') return { phase: 'SUBMITTED', session, reason: null };
  return {
    phase: 'EXPIRED',
    session,
    message: 'أُغلِقت جلسة هذا الاختبار من قبل.',
  };
}

function withAnswer(ctx: ActiveContext, questionId: QuestionId, value: AnswerValue): RunnerState {
  return { phase: 'ACTIVE', ctx: { ...ctx, answers: { ...ctx.answers, [questionId]: value } } };
}

/** Drop restored answers that don't match the paper (stale or tampered local storage). */
function sanitizeAnswers(
  answers: Readonly<Record<QuestionId, unknown>>,
  paper: ExamPaper,
): Record<QuestionId, AnswerValue> {
  const clean: Record<QuestionId, AnswerValue> = {};
  for (const q of paper.questions) {
    const a = answers[q.id];
    if (q.type === 'CHOICE' && Number.isInteger(a) && (a as number) >= 0 && (a as number) < q.options.length) {
      clean[q.id] = a as number;
    } else if (q.type === 'TEXT' && typeof a === 'string') {
      clean[q.id] = a.slice(0, q.maxLength);
    }
  }
  return clean;
}

/** A question counts as answered once it has an option or non-blank text. */
export function isAnswered(value: AnswerValue | undefined): boolean {
  return typeof value === 'number' || (typeof value === 'string' && value.trim().length > 0);
}