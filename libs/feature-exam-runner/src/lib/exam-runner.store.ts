import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { QuestionId } from '@exam/contracts';
import { ExamSessionGateway, ServerClock } from '@exam/data-access-exams';
import { arabicErrorMessage } from '@exam/ui-arabic';
import {
  type ActiveContext,
  initialRunnerState,
  isAnswered,
  remainingMs,
  type RunnerEvent,
  type RunnerState,
  toSubmissionDraft,
  transition,
} from './exam-runner.machine';

const TICK_MS = 250;
const DRAFT_KEY = (sessionId: string) => `exam-runner:draft:${sessionId}`;

/**
 * Runs the exam FSM: holds state in a signal, feeds it server-calibrated time, and executes the
 * side effects that belong to each phase *entry*. Effects only ever communicate back through
 * `dispatch`, so every state change is an auditable (state, event) → state step.
 *
 * Provided per runner page so all timers/listeners die with the route.
 */
@Injectable()
export class ExamRunnerStore {
  readonly #gateway = inject(ExamSessionGateway);
  readonly #clock = inject(ServerClock);
  readonly #document = inject(DOCUMENT);

  readonly #state = signal<RunnerState>(initialRunnerState);
  readonly state = this.#state.asReadonly();
  readonly phase = computed(() => this.#state().phase);

  /** Context while the paper is on screen (ACTIVE or SUBMITTING). */
  readonly active = computed<ActiveContext | null>(() => {
    const s = this.#state();
    return s.phase === 'ACTIVE' || s.phase === 'SUBMITTING' ? s.ctx : null;
  });
  readonly remainingMs = computed(() => {
    const ctx = this.active();
    return ctx ? remainingMs(ctx) : 0;
  });
  readonly totalMs = computed(() => {
    const ctx = this.active();
    return ctx ? ctx.session.expiresAt - ctx.session.startedAt : 0;
  });
  readonly answeredCount = computed(
    () => Object.values(this.active()?.answers ?? {}).filter((a) => isAnswered(a)).length,
  );

  #ticker: ReturnType<typeof setInterval> | null = null;
  readonly #onVisibility = () =>
    this.dispatch({
      type: 'VISIBILITY_CHANGED',
      hidden: this.#document.visibilityState === 'hidden',
      now: this.#clock.now(),
    });
  readonly #onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#stopRuntime());
  }

  /* -------------------------------------------------------------------------------------------- */
  /* Commands                                                                                     */
  /* -------------------------------------------------------------------------------------------- */

  async load(accessCode: string): Promise<void> {
    try {
      const lobby = await this.#gateway.lookupAccessCode(accessCode);
      this.dispatch(
        lobby
          ? { type: 'LOBBY_LOADED', lobby }
          : { type: 'LOBBY_FAILED', message: 'لا يوجد اختبار بهذا الرمز. تحقَّق منه ثم أعد المحاولة.' },
      );
    } catch (error) {
      this.dispatch({ type: 'LOBBY_FAILED', message: describe(error) });
    }
  }

  start(candidateName: string): void {
    this.dispatch({ type: 'START_REQUESTED', candidateName });
  }

  answer(questionId: QuestionId, option: number): void {
    this.dispatch({ type: 'ANSWER_SELECTED', questionId, option });
  }

  typeAnswer(questionId: QuestionId, text: string): void {
    this.dispatch({ type: 'ANSWER_TYPED', questionId, text });
  }

  submit(): void {
    this.dispatch({ type: 'SUBMIT_REQUESTED' });
  }

  /* -------------------------------------------------------------------------------------------- */
  /* FSM core                                                                                     */
  /* -------------------------------------------------------------------------------------------- */

  dispatch(event: RunnerEvent): void {
    const prev = this.#state();
    const next = transition(prev, event);
    if (next === prev) return;
    this.#state.set(next);

    if (next.phase !== prev.phase) this.#onEnter(next);
    const answersChanged =
      next.phase === 'ACTIVE' && (prev.phase !== 'ACTIVE' || prev.ctx.answers !== next.ctx.answers);
    if (answersChanged) this.#persistDraft(next.ctx);
  }

  #onEnter(state: RunnerState): void {
    switch (state.phase) {
      case 'STARTING':
        void this.#openSession(state.lobby.code, state.candidateName);
        break;
      case 'ACTIVE':
        this.#startRuntime();
        break;
      case 'SUBMITTING':
        void this.#submit(state.ctx, state.reason);
        break;
      case 'SUBMITTED':
      case 'EXPIRED':
        this.#stopRuntime();
        this.#clearDraft(state.session.id);
        break;
    }
  }

  async #openSession(accessCode: string, candidateName: string): Promise<void> {
    try {
      const { session } = await this.#gateway.startSession({ accessCode, candidateName });
      if (session.status !== 'ACTIVE' || session.expiresAt <= this.#clock.now()) {
        this.dispatch({ type: 'SESSION_CLOSED', session });
        return;
      }
      const paper = await this.#gateway.loadPaper(session.examId);
      this.dispatch({
        type: 'SESSION_OPENED',
        session,
        paper,
        now: this.#clock.now(),
        restoredAnswers: this.#readDraft(session.id),
      });
    } catch (error) {
      this.dispatch({ type: 'START_FAILED', message: describe(error) });
    }
  }

  async #submit(ctx: ActiveContext, reason: Parameters<typeof toSubmissionDraft>[1]): Promise<void> {
    try {
      await this.#gateway.submit(toSubmissionDraft(ctx, reason));
      this.dispatch({ type: 'SUBMIT_SUCCEEDED' });
    } catch (error) {
      // A lost acknowledgement can look like a failure; the doc is create-once, so check for it.
      if (await this.#gateway.hasSubmitted(ctx.session.id)) {
        this.dispatch({ type: 'SUBMIT_SUCCEEDED' });
      } else {
        this.dispatch({ type: 'SUBMIT_FAILED', message: describe(error), now: this.#clock.now() });
      }
    }
  }

  /* -------------------------------------------------------------------------------------------- */
  /* Runtime: ticker + visibility + unload guard                                                  */
  /* -------------------------------------------------------------------------------------------- */

  #startRuntime(): void {
    if (this.#ticker !== null) return;
    this.#ticker = setInterval(
      () => this.dispatch({ type: 'TICK', now: this.#clock.now() }),
      TICK_MS,
    );
    this.#document.addEventListener('visibilitychange', this.#onVisibility);
    this.#document.defaultView?.addEventListener('beforeunload', this.#onBeforeUnload);
  }

  #stopRuntime(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
    this.#document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#document.defaultView?.removeEventListener('beforeunload', this.#onBeforeUnload);
  }

  /* -------------------------------------------------------------------------------------------- */
  /* Crash/reload resilience: answers survive a refresh within the same session                   */
  /* -------------------------------------------------------------------------------------------- */

  #persistDraft(ctx: ActiveContext): void {
    try {
      localStorage.setItem(DRAFT_KEY(ctx.session.id), JSON.stringify(ctx.answers));
    } catch {
      /* storage unavailable (private mode / quota) — answers stay in memory */
    }
  }

  #readDraft(sessionId: string): Record<QuestionId, unknown> {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(sessionId));
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? (parsed as Record<QuestionId, unknown>) : {};
    } catch {
      return {};
    }
  }

  #clearDraft(sessionId: string): void {
    try {
      localStorage.removeItem(DRAFT_KEY(sessionId));
    } catch {
      /* ignore */
    }
  }
}

function describe(error: unknown): string {
  return arabicErrorMessage(error);
}
