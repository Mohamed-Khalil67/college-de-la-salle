import { Component, inject, input, output, resource } from '@angular/core';
import {
  type AnswerValue,
  type ChoiceQuestion,
  deliveredQuestions,
  type Question,
  type Submission,
} from '@exam/contracts';
import { SubmissionReviewService } from '@exam/data-access-exams';
import {
  ArCountPipe,
  ArNumberPipe,
  ArScorePipe,
  arabicErrorMessage,
  BidiIsolate,
  formatNumber,
} from '@exam/ui-arabic';
import { TextAnswerGrader } from './text-answer-grader';

/**
 * Full view of one submission. Multiple-choice answers are shown against the key (read-only);
 * written answers get a grader each. The `submission` input is live, so grades saved through the
 * Cloud Function flow back in via the dashboard's snapshot listener.
 */
@Component({
  selector: 'exam-submission-review-panel',
  imports: [TextAnswerGrader, ArCountPipe, ArNumberPipe, ArScorePipe, BidiIsolate],
  template: `
    @let s = submission();
    <section class="panel review" aria-labelledby="review-title">
      <header>
        <div>
          <p class="eyebrow">استعراض الإجابات</p>
          <h3 id="review-title"><bdi>{{ s.candidateName }}</bdi></h3>
          <p class="muted">
            @if (s.gradingStatus === 'GRADED') {
              الدرجة النهائية <strong>{{ s.score | arScore: s.maxScore }}</strong>
            } @else if (s.gradingStatus === 'NEEDS_REVIEW') {
              الدرجة الآلية {{ s.autoScore | arNumber }} ·
              {{ s.pendingReview.length | arCount: 'answer' }} مقالية بانتظار التصحيح
            } @else {
              جارٍ التصحيح الآلي…
            }
          </p>
        </div>
        <button type="button" (click)="closed.emit()">إغلاق</button>
      </header>

      @if (context.error(); as error) {
        <p class="form-error" role="alert">تعذَّر تحميل محتوى الاختبار: {{ errorText(error) }}</p>
      } @else if (context.value(); as ctx) {
        @for (q of delivered(ctx.paper.questions); track q.id; let i = $index) {
          @switch (q.type) {
            @case ('TEXT') {
              <exam-text-answer-grader
                [sessionId]="s.id"
                [question]="q"
                [label]="questionLabel(i)"
                [rubric]="ctx.key.rubrics[q.id]"
                [answer]="asText(answerOf(q.id))"
                [grade]="s.manualScores[q.id]"
                [storedSuggestion]="s.aiSuggestions[q.id]"
              />
            }
            @default {
              @let given = answerOf(q.id);
              @let correct = ctx.key.answers[q.id];
              <div class="choice">
                <h4>{{ questionLabel(i) }} · اختيار من متعدِّد · {{ q.points | arCount: 'point' }}</h4>
                <p class="prompt exam-text" examIsolate>{{ q.prompt }}</p>
                <p>
                  إجابة المُختبَر: <strong><bdi>{{ optionText(q, given) }}</bdi></strong>
                  @if (given === correct) {
                    <span class="ok">✓ صحيحة</span>
                  } @else {
                    <span class="bad">✗ الإجابة الصحيحة: <bdi>{{ optionText(q, correct) }}</bdi></span>
                  }
                </p>
              </div>
            }
          }
        }
      } @else {
        <p class="muted" aria-busy="true">جارٍ تحميل الأسئلة…</p>
      }
    </section>
  `,
  styles: `
    .review { display: grid; gap: 0.25rem; }
    .review header { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
    h3 { margin-block: 0.15rem; }
    header p { margin: 0; }
    .choice { padding-block: 1rem; border-block-start: 1px solid var(--border); }
    .choice h4 { margin-block: 0 0.25rem; font-family: var(--font-display); font-size: 1.15rem; color: var(--accent-strong); }
    .choice p { margin-block: 0.25rem; }
    .ok { color: var(--ok-strong); font-weight: 600; margin-inline-start: 0.5rem; }
    .bad { color: var(--danger); font-weight: 600; margin-inline-start: 0.5rem; }
  `,
})
export class SubmissionReviewPanel {
  readonly submission = input.required<Submission>();
  readonly closed = output<void>();

  readonly #review = inject(SubmissionReviewService);

  /** Paper + key are static per exam; reload only when the exam changes. */
  protected readonly context = resource({
    params: () => this.submission().examId,
    loader: ({ params }) => this.#review.loadGradingContext(params),
  });

  /** The questions this candidate received, in their order (bank draw + shuffle). */
  protected delivered(questions: readonly Question[]): Question[] {
    return deliveredQuestions(questions, this.submission().questionIds);
  }

  /** Answers mapped back to the authored option order by the grader. */
  protected answerOf(questionId: string): AnswerValue | undefined {
    const s = this.submission();
    return (s.canonicalAnswers ?? s.answers)[questionId];
  }

  protected questionLabel(index: number): string {
    return `السؤال ${formatNumber(index + 1)}`;
  }

  protected asText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  protected optionText(q: ChoiceQuestion, index: unknown): string {
    return typeof index === 'number' && q.options[index] !== undefined
      ? q.options[index]
      : '— لم يُجِب —';
  }

  protected errorText(error: unknown): string {
    return arabicErrorMessage(error);
  }
}
