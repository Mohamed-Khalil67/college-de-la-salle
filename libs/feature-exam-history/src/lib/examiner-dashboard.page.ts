import { Component, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { AccessMode, ExamMeta, ExamStatus } from '@exam/contracts';
import {
  AuthStore,
  ExamAuthoringService,
  ExaminerDashboardStore,
  SubmissionReviewService,
} from '@exam/data-access-exams';
import {
  ArClockPipe,
  ArCountPipe,
  ArDatePipe,
  ArNumberPipe,
  ArPercentPipe,
  ArScorePipe,
  arabicErrorMessage,
  BidiIsolate,
  ExamSharePanel,
  formatCount,
} from '@exam/ui-arabic';
import { SubmissionReviewPanel } from './review/submission-review-panel';
import { StatusBadge } from './status-badge';

const STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  CLOSED: 'مغلق',
};

const STATUS_DONE: Record<ExamStatus, string> = {
  DRAFT: 'أُعيد الاختبار إلى المسودات.',
  PUBLISHED: 'نُشِر الاختبار، ويمكن للمُختبَرين بدؤه الآن.',
  CLOSED: 'أُغلِق الاختبار، ولا يمكن لأحد بدؤه بعد الآن.',
};

@Component({
  selector: 'exam-examiner-dashboard-page',
  imports: [
    RouterLink,
    StatusBadge,
    SubmissionReviewPanel,
    ExamSharePanel,
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
  readonly #router = inject(Router);
  readonly #review = inject(SubmissionReviewService);
  readonly #authoring = inject(ExamAuthoringService);

  protected readonly publishing = signal(false);
  protected readonly publishMessage = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionMessage = signal<string | null>(null);

  /** Invited emails of the selected exam (pre-addresses the e-mail invitation). */
  protected readonly roster = resource({
    params: () => this.store.selectedExamId() ?? undefined,
    loader: ({ params }) => this.#authoring.loadRoster(params),
  });

  constructor() {
    effect(() => {
      const preferred = this.exam();
      if (preferred) untracked(() => this.store.selectedExamId.set(preferred));
    });
    effect(() => {
      this.store.selectedExamId();
      untracked(() => {
        this.actionMessage.set(null);
        this.publishMessage.set(null);
      });
    });
  }

  protected statusLabel(status: ExamStatus): string {
    return STATUS_LABELS[status];
  }

  protected accessLabel(mode: AccessMode): string {
    return mode === 'ROSTER' ? 'المدعوّون فقط' : 'كل من يملك الرمز';
  }

  protected async setStatus(exam: ExamMeta, status: ExamStatus): Promise<void> {
    await this.#act(async () => {
      await this.#authoring.setStatus(exam, status);
      return STATUS_DONE[status];
    });
  }

  protected async duplicate(examId: string): Promise<void> {
    await this.#act(async () => {
      const copy = await this.#authoring.duplicateExam(examId);
      await this.#router.navigate(['/examiner/exams', copy.examId, 'edit']);
      return null;
    });
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

  async #act(action: () => Promise<string | null>): Promise<void> {
    this.busy.set(true);
    this.actionMessage.set(null);
    try {
      this.actionMessage.set(await action());
    } catch (error) {
      this.actionMessage.set(arabicErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
