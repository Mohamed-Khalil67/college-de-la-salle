import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { LIMITS } from '@exam/contracts';
import { type CreatedExam, ExamAuthoringService } from '@exam/data-access-exams';
import {
  blankQuestion,
  examFormSchema,
  type ExamFormModel,
  initialExamModel,
  type QuestionModel,
  toNewExamInput,
} from './exam-form.model';
import { FieldErrors } from './field-errors';

@Component({
  selector: 'exam-creator-page',
  imports: [FormField, FormRoot, RouterLink, FieldErrors],
  templateUrl: './exam-creator.page.html',
  styleUrl: './exam-creator.page.scss',
})
export class ExamCreatorPage {
  readonly #authoring = inject(ExamAuthoringService);
  readonly #origin = inject(DOCUMENT).location.origin;

  protected readonly limits = LIMITS;
  protected readonly model = signal<ExamFormModel>(initialExamModel(Date.now()));
  protected readonly examForm = form(this.model, examFormSchema);

  protected readonly attempted = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly created = signal<CreatedExam | null>(null);

  protected readonly totalPoints = computed(() =>
    this.model().questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
  );
  protected readonly shareUrl = computed(() => {
    const created = this.created();
    return created ? `${this.#origin}/take/${created.accessCode}` : '';
  });

  protected save(event: Event): void {
    event.preventDefault();
    this.attempted.set(true);
    this.saveError.set(null);
    void submit(this.examForm, async () => {
      try {
        this.created.set(await this.#authoring.createExam(toNewExamInput(this.model())));
      } catch (error) {
        this.saveError.set(error instanceof Error ? error.message : 'Could not save the exam.');
      }
      return undefined;
    });
  }

  /* ---- dynamic question set: all mutations are immutable model updates ---- */

  protected addQuestion(): void {
    this.#updateQuestions((qs) => [...qs, blankQuestion()]);
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
    this.#updateQuestion(qi, (q) => ({ ...q, correctIndex: oi }));
  }

  protected startOver(): void {
    this.created.set(null);
    this.attempted.set(false);
    this.model.set(initialExamModel(Date.now()));
  }

  protected async copyLink(): Promise<void> {
    await navigator.clipboard?.writeText(this.shareUrl());
  }

  #updateQuestions(fn: (qs: QuestionModel[]) => QuestionModel[]): void {
    this.model.update((m) => ({ ...m, questions: fn(m.questions) }));
  }

  #updateQuestion(index: number, fn: (q: QuestionModel) => QuestionModel): void {
    this.#updateQuestions((qs) => qs.map((q, i) => (i === index ? fn(q) : q)));
  }
}
