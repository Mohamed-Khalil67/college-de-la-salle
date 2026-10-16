import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AuthStore,
  ExaminerDashboardStore,
  SubmissionReviewService,
} from '@exam/data-access-exams';
import { SubmissionReviewPanel } from './review/submission-review-panel';
import { StatusBadge } from './status-badge';
import {
  ArClockPipe,
  ArCountPipe,
  ArDatePipe,
  ArNumberPipe,
  ArPercentPipe,
  ArScorePipe,
  arabicErrorMessage,
  BidiIsolate,
  formatCount,
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
    ArPercentPipe,
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
  readonly #review = inject(SubmissionReviewService);
  protected readonly publishing = signal(false);
  protected readonly publishMessage = signal<string | null>(null);

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

  protected async publish(examId: string): Promise<void> {
    this.publishing.set(true);
    this.publishMessage.set(null);
    try {
      const { published } = await this.#review.publishResults(examId);
      this.publishMessage.set(`نُشِرت النتائج: ${formatCount(published, 'result')}.`);
    } catch (error) {
      this.publishMessage.set(arabicErrorMessage(error));
    } finally {
      this.publishing.set(false);
    }
  }

  protected errorText(error: unknown): string {
    return arabicErrorMessage(error);
  }
}
