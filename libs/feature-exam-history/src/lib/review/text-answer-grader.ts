import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, FormField, FormRoot, max, maxLength, min, required, submit, validate } from '@angular/forms/signals';
import {
  type AiSuggestion,
  LIMITS,
  type ManualGrade,
  type TextQuestion,
  type TextRubric,
} from '@exam/contracts';
import { SubmissionReviewService } from '@exam/data-access-exams';

/**
 * Grades one written answer. The AI suggestion only pre-fills the form; nothing is recorded until
 * the examiner saves, and the save goes through the `gradeTextAnswer` Cloud Function.
 */
@Component({
  selector: 'exam-text-answer-grader',
  imports: [FormField, FormRoot],
  template: `
    @let q = question();
    <article class="grader" [attr.aria-labelledby]="'grader-' + q.id">
      <header>
        <h4 [id]="'grader-' + q.id">{{ label() }} · written answer · {{ q.points }} pts</h4>
        @if (grade(); as g) {
          <span class="saved">Graded {{ g.points }} / {{ q.points }}{{ g.source === 'AI_ACCEPTED' ? ' (AI accepted)' : '' }}</span>
        } @else {
          <span class="pending">Needs grading</span>
        }
      </header>
      <p class="prompt">{{ q.prompt }}</p>

      <details>
        <summary>Rubric &amp; model answer</summary>
        <p><strong>Criteria:</strong> {{ rubric()?.criteria || '—' }}</p>
        <p><strong>Model answer:</strong> {{ rubric()?.modelAnswer || '—' }}</p>
      </details>

      <div class="answer" [attr.aria-label]="'Candidate answer to ' + label()">
        @if (answer().trim()) {
          {{ answer() }}
        } @else {
          <em class="muted">No answer submitted.</em>
        }
      </div>

      <section class="ai" aria-live="polite">
        @if (suggestion(); as s) {
          <p class="ai-result">
            <strong>AI suggests {{ s.points }} / {{ q.points }}</strong>
            <span class="muted"> · {{ s.model }}</span>
          </p>
          <p class="rationale">{{ s.rationale }}</p>
        }
        @if (aiError()) {
          <p class="form-error" role="alert">{{ aiError() }}</p>
        }
        <button type="button" (click)="askAi()" [disabled]="aiBusy()">
          {{ aiBusy() ? 'Asking AI…' : suggestion() ? 'Ask AI again' : 'Suggest grade with AI' }}
        </button>
        @if (suggestion() && !grade()) {
          <button type="button" (click)="useSuggestion()">Use suggestion</button>
        }
      </section>

      <form [formRoot]="gradeForm" (submit)="save($event)" class="grade-form">
        <div class="field">
          <label [for]="'pts-' + q.id">Points (0–{{ q.points }})</label>
          <input [id]="'pts-' + q.id" type="number" step="0.5" inputmode="decimal" [formField]="gradeForm.points" />
        </div>
        <div class="field grow">
          <label [for]="'fb-' + q.id">Feedback <span class="muted">(optional)</span></label>
          <textarea [id]="'fb-' + q.id" rows="2" [formField]="gradeForm.feedback"></textarea>
        </div>
        <button type="submit" class="primary" [disabled]="gradeForm().submitting()">
          {{ grade() ? 'Update grade' : 'Save grade' }}
        </button>
      </form>
      <p class="field-error" aria-live="polite">
        @if (gradeForm.points().touched()) {
          @for (e of gradeForm.points().errors(); track e.kind) { {{ e.message }} }
        }
        {{ saveError() }}
      </p>
    </article>
  `,
  styles: `
    .grader { display: grid; gap: 0.6rem; padding: 1rem 0; border-top: 1px solid var(--border); }
    header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: baseline; }
    h4 { margin: 0; font-size: 1rem; }
    .saved { color: var(--ok-strong); font-weight: 600; font-size: 0.9rem; }
    .pending { color: var(--warn-strong); font-weight: 600; font-size: 0.9rem; }
    .prompt { margin: 0; white-space: pre-wrap; }
    details { font-size: 0.9rem; color: var(--muted); }
    details p { margin: 0.35rem 0; white-space: pre-wrap; }
    .answer { white-space: pre-wrap; padding: 0.75rem 0.9rem; border-left: 3px solid var(--accent); background: var(--surface-2); border-radius: 4px; }
    .ai { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .ai p { margin: 0; flex-basis: 100%; }
    .rationale { font-size: 0.9rem; white-space: pre-wrap; }
    .grade-form { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end; }
    .field { display: grid; gap: 0.25rem; }
    .field input { width: 7rem; }
    .grow { flex: 1; min-width: 14rem; }
    .grow textarea { width: 100%; }
  `,
})
export class TextAnswerGrader {
  readonly sessionId = input.required<string>();
  readonly question = input.required<TextQuestion>();
  readonly label = input.required<string>();
  readonly rubric = input<TextRubric | undefined>();
  readonly answer = input.required<string>();
  readonly grade = input<ManualGrade | undefined>();
  readonly storedSuggestion = input<AiSuggestion | undefined>();

  readonly #review = inject(SubmissionReviewService);

  /** Fresh suggestion from this session, else the one stored on the submission. */
  protected readonly suggestion = linkedSignal<AiSuggestion | undefined>(() => this.storedSuggestion());
  protected readonly aiBusy = signal(false);
  protected readonly aiError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /** Re-seeds from the saved grade whenever the server copy changes. */
  protected readonly gradeModel = linkedSignal(() => ({
    points: this.grade()?.points ?? (null as number | null),
    feedback: this.grade()?.feedback ?? '',
  }));
  protected readonly gradeForm = form(this.gradeModel, (p) => {
    required(p.points, { message: 'Enter points.' });
    min(p.points, 0, { message: 'Points cannot be negative.' });
    max(p.points, () => this.question().points, { message: 'More than this question is worth.' });
    validate(p.points, ({ value }) =>
      value() === null || Number.isInteger((value() as number) * 2)
        ? null
        : { kind: 'half', message: 'Use whole or half points.' },
    );
    maxLength(p.feedback, LIMITS.maxFeedbackLength);
  });

  /** Whether the current form values are exactly the AI suggestion. */
  readonly #matchesSuggestion = computed(() => {
    const s = this.suggestion();
    return !!s && s.points === this.gradeModel().points;
  });

  protected async askAi(): Promise<void> {
    this.aiBusy.set(true);
    this.aiError.set(null);
    try {
      this.suggestion.set(
        await this.#review.suggestTextGrade({
          sessionId: this.sessionId(),
          questionId: this.question().id,
        }),
      );
    } catch (error) {
      this.aiError.set(error instanceof Error ? error.message : 'AI suggestion failed.');
    } finally {
      this.aiBusy.set(false);
    }
  }

  protected useSuggestion(): void {
    const s = this.suggestion();
    if (s) this.gradeModel.set({ points: s.points, feedback: s.rationale });
  }

  protected save(event: Event): void {
    event.preventDefault();
    this.saveError.set(null);
    void submit(this.gradeForm, async () => {
      try {
        await this.#review.gradeTextAnswer({
          sessionId: this.sessionId(),
          questionId: this.question().id,
          points: this.gradeModel().points as number,
          feedback: this.gradeModel().feedback,
          source: this.#matchesSuggestion() ? 'AI_ACCEPTED' : 'MANUAL',
        });
      } catch (error) {
        this.saveError.set(error instanceof Error ? error.message : 'Could not save the grade.');
      }
      return undefined;
    });
  }
}
