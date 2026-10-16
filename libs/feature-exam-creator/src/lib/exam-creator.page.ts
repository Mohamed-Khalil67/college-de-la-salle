import { Component, computed, effect, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { apply, disabled, form, FormField, FormRoot, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { type ExamStatus, LIMITS, parseRoster, type QuestionType } from '@exam/contracts';
import { type EditableExam, ExamAuthoringService } from '@exam/data-access-exams';
import {
  ArabicDateTimeInput,
  ArabicNumberInput,
  ArCountPipe,
  ArNumberPipe,
  arabicErrorMessage,
  ExamSharePanel,
} from '@exam/ui-arabic';
import {
  blankQuestion,
  examFormSchema,
  type ExamFormModel,
  initialExamModel,
  modelFromExam,
  type QuestionModel,
  toNewExamInput,
} from './exam-form.model';
import { FieldErrors } from './field-errors';

/** What the confirmation screen shows after a save. */
interface SavedExam {
  readonly examId: string;
  readonly accessCode: string;
  readonly status: ExamStatus;
  readonly title: string;
  readonly durationSeconds: number;
  readonly opensAt: number;
  readonly closesAt: number;
  readonly roster: readonly string[];
}

const STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  CLOSED: 'مغلق',
};

/**
 * Create (/examiner/new) or edit (/examiner/exams/:examId/edit). Once the first candidate has
 * started, the server locks the exam: the form freezes everything except the roster and status.
 */
@Component({
  selector: 'exam-creator-page',
  imports: [
    FormField,
    FormRoot,
    RouterLink,
    FieldErrors,
    ArCountPipe,
    ArNumberPipe,
    ArabicNumberInput,
    ArabicDateTimeInput,
    ExamSharePanel,
  ],
  templateUrl: './exam-creator.page.html',
  styleUrl: './exam-creator.page.scss',
})
export class ExamCreatorPage {
  /** Present in edit mode (route parameter). */
  readonly examId = input<string | undefined>();

  readonly #authoring = inject(ExamAuthoringService);

  protected readonly limits = LIMITS;

  readonly #loaded = resource({
    params: () => this.examId(),
    loader: ({ params }) => this.#authoring.loadExam(params),
  });
  protected readonly current = computed<EditableExam | null>(() => this.#loaded.value() ?? null);
  protected readonly loadError = computed(() =>
    this.#loaded.error() ? arabicErrorMessage(this.#loaded.error()) : null,
  );
  protected readonly locked = computed(() => this.current()?.meta.lockedAt != null);

  /** Blank for a new exam; re-seeded from the stored exam once it loads in edit mode. */
  protected readonly model = linkedSignal<ExamFormModel>(() => {
    const exam = this.current();
    return exam ? modelFromExam(exam) : initialExamModel(Date.now());
  });
  protected readonly examForm = form(this.model, (p) => {
    apply(p, examFormSchema);
    // After the first start only the roster stays editable (the rules enforce the same).
    const frozen = () => (this.locked() ? 'الاختبار مُجمَّد بعد بدء المُختبَرين' : false);
    disabled(p.title, frozen);
    disabled(p.description, frozen);
    disabled(p.durationMinutes, frozen);
    disabled(p.opensAt, frozen);
    disabled(p.closesAt, frozen);
    disabled(p.maxVisibilityLosses, frozen);
    disabled(p.passPercent, frozen);
    disabled(p.resultRelease, frozen);
    disabled(p.shuffleQuestions, frozen);
    disabled(p.shuffleOptions, frozen);
    disabled(p.questionsPerCandidate, frozen);
    disabled(p.accessMode, frozen);
    disabled(p.questions, frozen);
  });

  protected readonly attempted = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saved = signal<SavedExam | null>(null);

  protected readonly totalPoints = computed(() =>
    this.model().questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
  );
  protected readonly rosterCount = computed(() => parseRoster(this.model().rosterText).emails.length);

  constructor() {
    // Leaving a confirmation screen when the route changes to another exam.
    effect(() => {
      this.examId();
      this.saved.set(null);
    });
  }

  protected statusLabel(status: ExamStatus): string {
    return STATUS_LABELS[status];
  }

  protected save(status: ExamStatus): void {
    this.attempted.set(true);
    this.saveError.set(null);
    void submit(this.examForm, async () => {
      try {
        const input = toNewExamInput(this.model());
        const current = this.current();
        let examId: string;
        let accessCode: string;
        if (current) {
          await this.#authoring.updateExam(current, input, status);
          examId = current.meta.id;
          accessCode = current.meta.accessCode;
        } else {
          const created = await this.#authoring.createExam(
            input,
            status === 'CLOSED' ? 'DRAFT' : status,
          );
          examId = created.examId;
          accessCode = created.accessCode;
        }
        this.saved.set({
          examId,
          accessCode,
          status,
          title: input.title,
          durationSeconds: input.durationSeconds,
          opensAt: input.window.opensAt,
          closesAt: input.window.closesAt,
          roster: input.roster,
        });
        if (current) this.#loaded.reload();
      } catch (error) {
        this.saveError.set(arabicErrorMessage(error));
      }
      return undefined;
    });
  }

  /* ---- dynamic question set: all mutations are immutable model updates ---- */

  protected addQuestion(type: QuestionType): void {
    this.#updateQuestions((qs) => [...qs, blankQuestion(type)]);
  }

  protected removeQuestion(index: number): void {
    this.#updateQuestions((qs) => qs.filter((_, i) => i !== index));
  }

  protected addOption(qi: number): void {
    this.#updateQuestion(qi, (q) => ({ ...q, options: [...q.options, ''] }));
  }

  protected removeOption(qi: number, oi: number): void {
    this.#updateQuestion(qi, (q) => {
      const options = q.options.filter((_, i) => i !== oi);
      // Keep the correct-answer marker pointing at the same option text.
      const correctIndex =
        q.correctIndex === oi ? 0 : q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex;
      return { ...q, options, correctIndex };
    });
  }

  protected markCorrect(qi: number, oi: number): void {
    if (this.locked()) return;
    this.#updateQuestion(qi, (q) => ({ ...q, correctIndex: oi }));
  }

  protected startOver(): void {
    this.saved.set(null);
    this.attempted.set(false);
    this.model.set(initialExamModel(Date.now()));
  }

  #updateQuestions(fn: (qs: QuestionModel[]) => QuestionModel[]): void {
    this.model.update((m) => ({ ...m, questions: fn(m.questions) }));
  }

  #updateQuestion(index: number, fn: (q: QuestionModel) => QuestionModel): void {
    this.#updateQuestions((qs) => qs.map((q, i) => (i === index ? fn(q) : q)));
  }
}
