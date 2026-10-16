import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore, ExaminerDashboardStore } from '@exam/data-access-exams';
import { SubmissionReviewPanel } from './review/submission-review-panel';
import { StatusBadge } from './status-badge';
import {
  ArClockPipe,
  ArCountPipe,
  ArDatePipe,
  ArNumberPipe,
  ArScorePipe,
  arabicErrorMessage,
  BidiIsolate,
} from '@exam/ui-arabic';

@Component({
  selector: 'exam-examiner-dashboard-page',
  imports: [
    RouterLink,
    StatusBadge,
    SubmissionReviewPanel,
    ArClockPipe,
    ArCountPipe,
    ArDatePipe,
    ArNumberPipe,
    ArScorePipe,
    BidiIsolate,
  ],
  providers: [ExaminerDashboardStore],
  templateUrl: './examiner-dashboard.page.html',
  styleUrl: './examiner-dashboard.page.scss',
})
export class ExaminerDashboardPage {
  /** Optional `?exam=` query param, e.g. when arriving from the creator. */
  readonly exam = input<string | undefined>();

  protected readonly store = inject(ExaminerDashboardStore);
  protected readonly auth = inject(AuthStore);
  protected readonly origin = inject(DOCUMENT).location.origin;
  readonly #router = inject(Router);

  constructor() {
    effect(() => {
      const preferred = this.exam();
      if (preferred) untracked(() => this.store.selectedExamId.set(preferred));
    });
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.#router.navigateByUrl('/');
  }

  protected errorText(error: unknown): string {
    return arabicErrorMessage(error);
  }
}
