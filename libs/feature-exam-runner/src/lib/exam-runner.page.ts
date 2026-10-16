import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { form, FormField, FormRoot, maxLength, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { LIMITS } from '@exam/contracts';
import { ArCountPipe, ArDatePipe, ArNumberPipe, BidiIsolate, Star } from '@exam/ui-arabic';
import { ExamRunnerStore } from './exam-runner.store';
import { Countdown } from './ui/countdown';
import { QuestionCard } from './ui/question-card';
import { TextQuestionCard } from './ui/text-question-card';

@Component({
  selector: 'exam-runner-page',
  imports: [
    Countdown,
    QuestionCard,
    TextQuestionCard,
    FormField,
    FormRoot,
    RouterLink,
    ArCountPipe,
    ArDatePipe,
    ArNumberPipe,
    BidiIsolate,
    Star,
  ],
  providers: [ExamRunnerStore],
  templateUrl: './exam-runner.page.html',
  styleUrl: './exam-runner.page.scss',
})
export class ExamRunnerPage {
  /** Bound from the `/take/:code` route parameter. */
  readonly code = input.required<string>();

  protected readonly store = inject(ExamRunnerStore);
  protected readonly confirmingSubmit = signal(false);

  protected readonly candidate = signal({ name: '' });
  protected readonly candidateForm = form(this.candidate, (p) => {
    required(p.name, { message: 'أدخِل اسمك ليتعرَّف عليك المُمتحِن.' });
    maxLength(p.name, LIMITS.maxCandidateNameLength, { message: 'الاسم أطول من المسموح.' });
  });

  constructor() {
    effect(() => {
      const code = this.code();
      untracked(() => void this.store.load(code));
    });
  }

  protected start(event: Event): void {
    event.preventDefault();
    void submit(this.candidateForm, async () => {
      this.store.start(this.candidate().name.trim());
      return undefined;
    });
  }

  protected requestSubmit(): void {
    if (this.confirmingSubmit()) {
      this.confirmingSubmit.set(false);
      this.store.submit();
    } else {
      this.confirmingSubmit.set(true);
    }
  }
}
