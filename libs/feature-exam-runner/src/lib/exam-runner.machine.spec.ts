import { AUTO_SUBMIT_LEAD_MS, type AccessCodeRecord, type ExamPaper, type ExamSession } from '@exam/contracts';
import {
  initialRunnerState,
  isAnswered,
  type RunnerEvent,
  type RunnerState,
  toSubmissionDraft,
  transition,
} from './exam-runner.machine';

const T0 = 1_700_000_000_000;
const DURATION = 5 * 60_000;

const lobby: AccessCodeRecord = {
  code: 'ABC234',
  examId: 'exam-1',
  ownerId: 'examiner',
  title: 'Midterm',
  description: '',
  durationSeconds: 300,
  questionCount: 2,
  window: { opensAt: T0 - 60_000, closesAt: T0 + 3_600_000 },
};

const session: ExamSession = {
  id: 'exam-1_cand',
  examId: 'exam-1',
  examOwnerId: 'examiner',
  examTitle: 'Midterm',
  candidateId: 'cand',
  candidateName: 'Carol',
  startedAt: T0,
  expiresAt: T0 + DURATION,
  status: 'ACTIVE',
  integrity: { maxVisibilityLosses: 2 },
  submittedAt: null,
};

const paper: ExamPaper = {
  ownerId: 'examiner',
  questions: [
    { id: 'q1', type: 'CHOICE', prompt: 'A?', options: ['x', 'y', 'z'], points: 1 },
    { id: 'q2', type: 'CHOICE', prompt: 'B?', options: ['x', 'y'], points: 2 },
    { id: 'q3', type: 'TEXT', prompt: 'Explain.', points: 4, maxLength: 10 },
  ],
};

function run(events: RunnerEvent[], from: RunnerState = initialRunnerState): RunnerState {
  return events.reduce(transition, from);
}

function active(now = T0 + 1_000): RunnerState {
  return run([
    { type: 'LOBBY_LOADED', lobby },
    { type: 'START_REQUESTED', candidateName: 'Carol' },
    { type: 'SESSION_OPENED', session, paper, now, restoredAnswers: {} },
  ]);
}

describe('exam runner FSM', () => {
  it('walks LOADING → LOBBY → STARTING → ACTIVE', () => {
    expect(run([{ type: 'LOBBY_LOADED', lobby }]).phase).toBe('LOBBY');
    expect(
      run([
        { type: 'LOBBY_LOADED', lobby },
        { type: 'START_REQUESTED', candidateName: 'Carol' },
      ]).phase,
    ).toBe('STARTING');
    expect(active().phase).toBe('ACTIVE');
  });

  it('returns to the lobby with an error when the server refuses to start', () => {
    const state = run([
      { type: 'LOBBY_LOADED', lobby },
      { type: 'START_REQUESTED', candidateName: 'Carol' },
      { type: 'START_FAILED', message: 'This exam window has closed.' },
    ]);
    expect(state).toEqual({ phase: 'LOBBY', lobby, error: 'This exam window has closed.' });
  });

  it('ignores events that are not valid in the current phase', () => {
    const lobbyState = run([{ type: 'LOBBY_LOADED', lobby }]);
    expect(transition(lobbyState, { type: 'SUBMIT_REQUESTED' })).toBe(lobbyState);
    expect(transition(lobbyState, { type: 'TICK', now: T0 })).toBe(lobbyState);
  });

  it('records answers and rejects out-of-range or unknown answers', () => {
    let state = transition(active(), { type: 'ANSWER_SELECTED', questionId: 'q1', option: 2 });
    state = transition(state, { type: 'ANSWER_SELECTED', questionId: 'q2', option: 5 });
    state = transition(state, { type: 'ANSWER_SELECTED', questionId: 'nope', option: 0 });
    expect(state.phase === 'ACTIVE' && state.ctx.answers).toEqual({ q1: 2 });
  });

  it('records typed answers for written questions, capped at maxLength', () => {
    let state = transition(active(), { type: 'ANSWER_TYPED', questionId: 'q3', text: 'Hello world, long' });
    state = transition(state, { type: 'ANSWER_TYPED', questionId: 'q1', text: 'not a choice' });
    state = transition(state, { type: 'ANSWER_SELECTED', questionId: 'q3', option: 0 });
    expect(state.phase === 'ACTIVE' && state.ctx.answers).toEqual({ q3: 'Hello worl' });
  });

  it('counts blank text as unanswered', () => {
    expect(isAnswered('   ')).toBe(false);
    expect(isAnswered('x')).toBe(true);
    expect(isAnswered(0)).toBe(true);
    expect(isAnswered(undefined)).toBe(false);
  });

  it('restores only answers that fit the paper', () => {
    const state = run([
      { type: 'LOBBY_LOADED', lobby },
      { type: 'START_REQUESTED', candidateName: 'Carol' },
      {
        type: 'SESSION_OPENED',
        session,
        paper,
        now: T0 + 1_000,
        restoredAnswers: { q1: 1, q2: 9, ghost: 0, q3: 'draft text that is long' },
      },
    ]);
    expect(state.phase === 'ACTIVE' && state.ctx.answers).toEqual({ q1: 1, q3: 'draft text' });
  });

  describe('timer', () => {
    it('stays ACTIVE while outside the auto-submit lead window', () => {
      const state = transition(active(), {
        type: 'TICK',
        now: session.expiresAt - AUTO_SUBMIT_LEAD_MS - 1,
      });
      expect(state.phase).toBe('ACTIVE');
    });

    it('auto-submits when the lead window is reached', () => {
      const state = transition(active(), {
        type: 'TICK',
        now: session.expiresAt - AUTO_SUBMIT_LEAD_MS,
      });
      expect(state.phase).toBe('SUBMITTING');
      expect(state.phase === 'SUBMITTING' && state.reason).toBe('AUTO_TIMER');
    });

    it('auto-submits immediately if the session opens inside the lead window (resume late)', () => {
      expect(active(session.expiresAt - 1_000).phase).toBe('SUBMITTING');
    });

    it('derives remaining time from absolute server time, so a long background gap is caught', () => {
      // Background tabs throttle timers; the first tick after waking jumps far ahead.
      const state = transition(active(), { type: 'TICK', now: session.expiresAt + 30_000 });
      expect(state.phase).toBe('SUBMITTING');
    });

    it('a failed submit after the deadline ends in EXPIRED', () => {
      const submitting = transition(active(), { type: 'SUBMIT_REQUESTED' });
      const state = transition(submitting, {
        type: 'SUBMIT_FAILED',
        message: 'permission-denied',
        now: session.expiresAt + 1,
      });
      expect(state.phase).toBe('EXPIRED');
    });

    it('a failed submit before the deadline returns to ACTIVE so it can retry', () => {
      const submitting = transition(active(), { type: 'SUBMIT_REQUESTED' });
      const state = transition(submitting, {
        type: 'SUBMIT_FAILED',
        message: 'unavailable',
        now: T0 + 2_000,
      });
      expect(state.phase).toBe('ACTIVE');
      expect(state.phase === 'ACTIVE' && state.ctx.lastError).toBe('unavailable');
    });

    it('freezes answers while submitting', () => {
      const submitting = transition(active(), { type: 'SUBMIT_REQUESTED' });
      expect(
        transition(submitting, { type: 'ANSWER_SELECTED', questionId: 'q1', option: 0 }),
      ).toBe(submitting);
    });

    it('SUBMIT_SUCCEEDED is terminal', () => {
      const done = run([{ type: 'SUBMIT_REQUESTED' }, { type: 'SUBMIT_SUCCEEDED' }], active());
      expect(done.phase).toBe('SUBMITTED');
      expect(transition(done, { type: 'TICK', now: T0 + DURATION * 2 })).toBe(done);
    });
  });

  describe('visibility / integrity', () => {
    it('counts tab losses and accumulates hidden time', () => {
      const state = run(
        [
          { type: 'VISIBILITY_CHANGED', hidden: true, now: T0 + 10_000 },
          { type: 'VISIBILITY_CHANGED', hidden: true, now: T0 + 11_000 }, // duplicate
          { type: 'VISIBILITY_CHANGED', hidden: false, now: T0 + 14_000 },
        ],
        active(),
      );
      expect(state.phase === 'ACTIVE' && state.ctx.integrity).toEqual({
        visibilityLossCount: 1,
        hiddenMs: 4_000,
        hiddenSince: null,
      });
    });

    it('auto-submits when the integrity policy is exceeded', () => {
      const state = run(
        [
          { type: 'VISIBILITY_CHANGED', hidden: true, now: T0 + 1_000 },
          { type: 'VISIBILITY_CHANGED', hidden: false, now: T0 + 2_000 },
          { type: 'VISIBILITY_CHANGED', hidden: true, now: T0 + 3_000 },
          { type: 'VISIBILITY_CHANGED', hidden: false, now: T0 + 4_000 },
          { type: 'VISIBILITY_CHANGED', hidden: true, now: T0 + 5_000 },
        ],
        active(),
      );
      expect(state.phase === 'SUBMITTING' && state.reason).toBe('AUTO_INTEGRITY');
    });

    it('returning to the tab after expiry triggers the timer auto-submit', () => {
      const state = run(
        [
          { type: 'VISIBILITY_CHANGED', hidden: true, now: T0 + 1_000 },
          { type: 'VISIBILITY_CHANGED', hidden: false, now: session.expiresAt + 5_000 },
        ],
        active(),
      );
      expect(state.phase === 'SUBMITTING' && state.reason).toBe('AUTO_TIMER');
    });

    it('never auto-submits on tab switches when the policy is record-only', () => {
      const recordOnly = { ...session, integrity: { maxVisibilityLosses: null } };
      let state = run([
        { type: 'LOBBY_LOADED', lobby },
        { type: 'START_REQUESTED', candidateName: 'Carol' },
        { type: 'SESSION_OPENED', session: recordOnly, paper, now: T0, restoredAnswers: {} },
      ]);
      for (let i = 0; i < 20; i++) {
        state = transition(state, { type: 'VISIBILITY_CHANGED', hidden: i % 2 === 0, now: T0 + i });
      }
      expect(state.phase).toBe('ACTIVE');
    });
  });

  it('builds a submission draft that echoes the server expiry and counts open hidden time', () => {
    const state = run(
      [
        { type: 'ANSWER_SELECTED', questionId: 'q2', option: 1 },
        { type: 'VISIBILITY_CHANGED', hidden: true, now: T0 + 10_000 },
        { type: 'TICK', now: T0 + 12_500 },
      ],
      active(),
    );
    if (state.phase !== 'ACTIVE') throw new Error('expected ACTIVE');
    expect(toSubmissionDraft(state.ctx, 'CANDIDATE')).toEqual({
      sessionId: session.id,
      examId: 'exam-1',
      examOwnerId: 'examiner',
      candidateId: 'cand',
      candidateName: 'Carol',
      answers: { q2: 1 },
      integrity: { visibilityLossCount: 1, hiddenMs: 2_500 },
      completedBy: 'CANDIDATE',
      expiresAt: session.expiresAt,
    });
  });

  it('a resumed, already-closed session lands in a terminal state', () => {
    const starting = run([
      { type: 'LOBBY_LOADED', lobby },
      { type: 'START_REQUESTED', candidateName: 'Carol' },
    ]);
    expect(
      transition(starting, { type: 'SESSION_CLOSED', session: { ...session, status: 'SUBMITTED' } })
        .phase,
    ).toBe('SUBMITTED');
    expect(
      transition(starting, { type: 'SESSION_CLOSED', session: { ...session, status: 'EXPIRED' } })
        .phase,
    ).toBe('EXPIRED');
  });
});
