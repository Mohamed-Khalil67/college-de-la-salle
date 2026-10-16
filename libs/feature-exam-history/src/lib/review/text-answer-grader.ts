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
import {
  ArabicNumberInput,
  ArCountPipe,
  ArNumberPipe,
  ArScorePipe,
  arabicErrorMessage,
  BidiIsolate,
} from '@exam/ui-arabic';

/**
 * Grades one written answer. The AI suggestion only pre-fills the form; nothing is recorded until
 * the examiner saves, and the save goes through the `gradeTextAnswer` Cloud Function.
 */
@Component({
  selector: 'exam-text-answer-grader',
  imports: [FormField, FormRoot, ArCountPipe, ArNumberPipe, ArScorePipe, BidiIsolate, ArabicNumberInput],
  template: `
    @let q = question();
    <article class="grader" [attr.aria-labelledby]="'grader-' + q.id">
      <header>
        <h4 [id]="'grader-' + q.id">{{ label() }} · إجابة مقالية · {{ q.points | arCount: 'point' }}</h4>
        @if (grade(); as g) {
          <span class="saved">
            صُحِّح: {{ g.points | arScore: q.points }}{{ g.source === 'AI_ACCEPTED' ? ' (باقتراح الذكاء الاصطناعي)' : '' }}
          </span>
        } @else {
          <span class="pending">بانتظار التصحيح</span>
        }
      </header>
      <p class="prompt exam-text" examIsolate>{{ q.prompt }}</p>

      <details>
        <summary>معايير التصحيح والإجابة النموذجية</summary>
        <p><strong>المعايير:</strong> <span examIsolate>{{ rubric()?.criteria || '—' }}</span></p>
        <p><strong>الإجابة النموذجية:</strong> <span examIsolate>{{ rubric()?.modelAnswer || '—' }}</span></p>
      </details>

      <div class="answer exam-text" examIsolate [attr.aria-label]="'إجابة المُختبَر عن ' + label()">
        @if (answer().trim()) {
          {{ answer() }}
        } @else {
          <em class="muted">لم تُقدَّم إجابة.</em>
        }
      </div>

      <section class="ai" aria-live="polite">
        @if (suggestion(); as s) {
          <p class="ai-result">
            <strong>يقترح الذكاء الاصطناعي: {{ s.points | arScore: q.points }}</strong>
            <span class="muted"> · <bdi>{{ s.model }}</bdi></span>
          </p>
          <p class="rationale" examIsolate>{{ s.rationale }}</p>
        }
        @if (aiError()) {
          <p class="form-error" role="alert">{{ aiError() }}</p>
        }
        <button type="button" (click)="askAi()" [disabled]="aiBusy()">
          {{ aiBusy() ? 'جارٍ سؤال الذكاء الاصطناعي…' : suggestion() ? 'اطلب اقتراحًا جديدًا' : 'اقتراح درجة بالذكاء الاصطناعي' }}
        </button>
        @if (suggestion() && !grade()) {
          <button type="button" (click)="useSuggestion()">اعتماد الاقتراح</button>
        }
      </section>

      <form [formRoot]="gradeForm" (submit)="save($event)" class="grade-form">
        <div class="field">
          <label [for]="'pts-' + q.id">الدرجة (من ٠ إلى {{ q.points | arNumber }})</label>
          <exam-number-input [inputId]="'pts-' + q.id" [allowDecimal]="true" [formField]="gradeForm.points" />
        </div>
        <div class="field grow">
          <label [for]="'fb-' + q.id">ملاحظات للمُختبَر <span class="muted">(اختياري)</span></label>
          <textarea [id]="'fb-' + q.id" rows="2" dir="auto" [formField]="gradeForm.feedback"></textarea>
        </div>
        <button type="submit" class="primary" [disabled]="gradeForm().submitting()">
          {{ grade() ? 'تحديث الدرجة' : 'حفظ الدرجة' }}
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
    .grader { display: grid; gap: 0.6rem; padding-block: 1rem; border-block-start: 1px solid var(--border); }
    header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: baseline; }
    h4 { margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--accent-strong); }
    .saved { color: var(--ok-strong); font-weight: 600; font-size: 0.9rem; }
    .pending { color: var(--warn-strong); font-weight: 600; font-size: 0.9rem; }
    .prompt { margin: 0; }
    details { font-size: 0.95rem; color: var(--muted); }
    summary { cursor: pointer; font-weight: 600; }
    details p { margin-block: 0.35rem; white-space: pre-wrap; }
    /* Accent rule on the reading-start edge: right in RTL, left in LTR. */
    .answer {
      padding-block: 0.75rem; padding-inline: 0.9rem; background: var(--surface-2);
      border-inline-start: 3px solid var(--accent); border-radius: 0;
    }
    .ai { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .ai p { margin: 0; flex-basis: 100%; }
    .rationale { font-size: 0.95rem; white-space: pre-wrap; }
    .grade-form { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end; }
    .field { display: grid; gap: 0.25rem; }
    .field exam-number-input { inline-size: 7rem; }
    .grow { flex: 1; min-inline-size: 14rem; }
    .grow textarea { inline-size: 100%; }
  `,
})export class TextAnswerGrader {
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
    required(p.points, { message: 'أدخِل الدرجة.' });
    min(p.points, 0, { message: 'لا يمكن أن تكون الدرجة سالبة.' });
    max(p.points, () => this.question().points, { message: 'الدرجة أعلى من درجة السؤال.' });
    validate(p.points, ({ value }) =>
      value() === null || Number.isInteger((value() as number) * 2)
        ? null
        : { kind: 'half', message: 'استعمل درجات صحيحة أو أنصاف درجات.' },
    );
    maxLength(p.feedback, LIMITS.maxFeedbackLength, { message: 'الملاحظات أطول من المسموح.' });
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
      this.aiError.set(arabicErrorMessage(error));
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
        this.saveError.set(arabicErrorMessage(error));
      }
      return undefined;
    });
  }
}
