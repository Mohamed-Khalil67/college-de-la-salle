import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { type ExamResult, isAnswered, type QuestionId } from '@exam/contracts';
import { ExamSessionGateway, ServerClock } from '@exam/data-access-exams';
import { arabicErrorMessage } from '@exam/ui-arabic';
import {
  type ActiveContext,
  initialRunnerState,
  remainingMs,
  type RunnerEvent,
  type RunnerState,
  toSubmissionDraft,
  transition,
} from './exam-runner.machine';

const TICK_MS = 250;
/** Autosave this long after the last change — frequent enough to lose almost nothing. */
const AUTOSAVE_DEBOUNCE_MS = 1_200;
const DRAFT_KEY = (sessionId: string) => `exam-runner:draft:${sessionId}`;

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface LocalDraft {
  readonly answers: Record<QuestionId, unknown>;
  readonly flagged: QuestionId[];
}

/**
 * Runs the exam FSM: holds state in a signal, feeds it server-calibrated time, and executes the
 * side effects that belong to each phase *entry*. Effects only ever communicate back through
 * `dispatch`, so every state change is an auditable (state, event) → state step.
 *
 * Work-in-progress is saved twice: instantly to localStorage (survives a reload on this device)
 * and, debounced, to the server draft (survives the device itself — the server submits the draft
 * if the session expires without a submission).
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
  /** 1-based numbers of unanswered questions, for the submit confirmation. */
  readonly unansweredNumbers = computed(() => {
    const ctx = this.active();
    if (!ctx) return [];
    return ctx.paper.questions.flatMap((q, i) => (isAnswered(ctx.answers[q.id]) ? [] : [i + 1]));
  });
  readonly flaggedNumbers = computed(() => {
    const ctx = this.active();
    if (!ctx) return [];
    const flagged = new Set(ctx.flagged);
    return ctx.paper.questions.flatMap((q, i) => (flagged.has(q.id) ? [i + 1] : []));
  });

  /* Server autosave status, shown to the candidate. */
  readonly saveState = signal<SaveState>('idle');
  readonly lastSavedAt = signal<number | null>(null);

  /* Released result (after submission). `undefined` = not checked yet, `null` = not released. */
  readonly result = signal<ExamResult | null | undefined>(undefined);

  #ticker: ReturnType<typeof setInterval> | null = null;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #saveQueued = false;
  #saveInFlight: Promise<void> | null = null;
  #stopResultWatch: (() => void) | null = null;

  readonly #onVisibility = () => {
    const hidden = this.#document.visibilityState === 'hidden';
    if (hidden) this.#flushSave(); // the tab may never come back
    this.dispatch({ type: 'VISIBILITY_CHANGED', hidden, now: this.#clock.now() });
  };
  readonly #onPageHide = () => this.#flushSave();
  readonly #onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#stopRuntime();
      this.#stopResultWatch?.();
    });
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

  toggleFlag(questionId: QuestionId): void {
    this.dispatch({ type: 'FLAG_TOGGLED', questionId });
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
    const workChanged =
      next.phase === 'ACTIVE' &&
      (prev.phase !== 'ACTIVE' ||
        prev.ctx.answers !== next.ctx.answers ||
        prev.ctx.flagged !== next.ctx.flagged);
    if (workChanged) {
      this.#persistLocal(next.ctx);
      if (prev.phase === 'ACTIVE') this.#scheduleSave();
    }
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
        this.#cancelSave();
        void this.#submit(state.ctx, state.reason);
        break;
      case 'SUBMITTED':
        this.#stopRuntime();
        this.#clearLocal(state.session.id);
        this.#watchResult(state.session.id);
        break;
      case 'EXPIRED':
        this.#stopRuntime();
        this.#clearLocal(state.session.id);
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
      const [paper, serverDraft] = await Promise.all([
        this.#gateway.loadPaper(session.id),
        this.#gateway.loadDraft(session.id),
      ]);
      // The server copy wins: it is what will be graded if this device goes away.
      const local = this.#readLocal(session.id);
      this.dispatch({
        type: 'SESSION_OPENED',
        session,
        paper,
        now: this.#clock.now(),
        restoredAnswers: serverDraft?.answers ?? local.answers,
        restoredFlags: serverDraft?.flagged ?? local.flagged,
      });
      if (serverDraft) {
        this.saveState.set('saved');
        this.lastSavedAt.set(serverDraft.updatedAt);
      }
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

  #watchResult(sessionId: string): void {
    this.#stopResultWatch?.();
    this.#stopResultWatch = this.#gateway.watchResult(sessionId, (result) => this.result.set(result));
  }

  /* -------------------------------------------------------------------------------------------- */
  /* Server autosave                                                                              */
  /* -------------------------------------------------------------------------------------------- */

  #scheduleSave(): void {
    this.saveState.set('pending');
    if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.#flushSave(), AUTOSAVE_DEBOUNCE_MS);
  }

  #cancelSave(): void {
    if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
  }

  /**
   * Saves now. Serialised: changes made while a save is in flight trigger exactly one follow-up
   * save. "Changed" means answers/flags changed — not `now`, which moves on every tick.
   */
  #flushSave(): void {
    this.#cancelSave();
    const s = this.#state();
    if (s.phase !== 'ACTIVE') return;
    if (this.saveState() !== 'pending' && this.saveState() !== 'error') return; // nothing new
    if (this.#saveInFlight) {
      this.#saveQueued = true;
      return;
    }
    const { answers, flagged } = s.ctx;
    const ctx = s.ctx;
    this.saveState.set('saving');
    this.#saveInFlight = this.#gateway
      .saveDraft(ctx.session.id, {
        examId: ctx.session.examId,
        candidateId: ctx.session.candidateId,
        examOwnerId: ctx.session.examOwnerId,
        answers,
        flagged,
        integrity: toSubmissionDraft(ctx, 'CANDIDATE').integrity,
      })
      .then(() => {
        this.lastSavedAt.set(this.#clock.now());
        const now = this.#state();
        const unchanged =
          now.phase === 'ACTIVE' && now.ctx.answers === answers && now.ctx.flagged === flagged;
        this.saveState.set(unchanged ? 'saved' : 'pending');
      })
      .catch(() => this.saveState.set('error'))
      .finally(() => {
        this.#saveInFlight = null;
        if (this.#saveQueued && this.#state().phase === 'ACTIVE') {
          this.#saveQueued = false;
          this.#flushSave();
        }
      });
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
    const win = this.#document.defaultView;
    this.#document.addEventListener('visibilitychange', this.#onVisibility);
    win?.addEventListener('pagehide', this.#onPageHide);
    win?.addEventListener('beforeunload', this.#onBeforeUnload);
  }

  #stopRuntime(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
    this.#cancelSave();
    const win = this.#document.defaultView;
    this.#document.removeEventListener('visibilitychange', this.#onVisibility);
    win?.removeEventListener('pagehide', this.#onPageHide);
    win?.removeEventListener('beforeunload', this.#onBeforeUnload);
  }

  /* -------------------------------------------------------------------------------------------- */
  /* Local copy: instant, survives a reload on this device                                        */
  /* -------------------------------------------------------------------------------------------- */

  #persistLocal(ctx: ActiveContext): void {
    try {
      const draft: LocalDraft = { answers: { ...ctx.answers }, flagged: [...ctx.flagged] };
      localStorage.setItem(DRAFT_KEY(ctx.session.id), JSON.stringify(draft));
    } catch {
      /* storage unavailable (private mode / quota) — the server draft still covers us */
    }
  }

  #readLocal(sessionId: string): LocalDraft {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(sessionId));
      const parsed = raw ? (JSON.parse(raw) as Partial<LocalDraft>) : {};
      return {
        answers: parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {},
        flagged: Array.isArray(parsed.flagged) ? parsed.flagged : [],
      };
    } catch {
      return { answers: {}, flagged: [] };
    }
  }

  #clearLocal(sessionId: string): void {
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
