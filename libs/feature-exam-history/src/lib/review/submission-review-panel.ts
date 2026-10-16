import { Component, inject, input, output, resource } from '@angular/core';
import type { ChoiceQuestion, Submission } from '@exam/contracts';
import { SubmissionReviewService } from '@exam/data-access-exams';
import { TextAnswerGrader } from './text-answer-grader';

/**
 * Full view of one submission. Multiple-choice answers are shown against the key (read-only);
 * written answers get a grader each. The `submission` input is live, so grades saved through the
 * Cloud Function flow back in via the dashboard's snapshot listener.
 */
@Component({
  selector: 'exam-submission-review-panel',
  imports: [TextAnswerGrader],
  template: `
    @let s = submission();
    <section class="panel review" aria-labelledby="review-title">
      <header>
        <div>
          <p class="eyebrow">Review submission</p>
          <h3 id="review-title">{{ s.candidateName }}</h3>
          <p class="muted">
            @if (s.gradingStatus === 'GRADED') {
              Final score <strong>{{ s.score }} / {{ s.maxScore }}</strong>
            } @else if (s.gradingStatus === 'NEEDS_REVIEW') {
              Auto-graded {{ s.autoScore }} pts · {{ s.pendingReview.length }} written answer(s) to grade
            } @else {
              Automatic grading in progress…
            }
          </p>
        </div>
        <button type="button" (click)="closed.emit()">Close</button>
      </header>

      @if (context.error(); as error) {
        <p class="form-error" role="alert">Couldn't load exam content: {{ error.message }}</p>
      } @else if (context.value(); as ctx) {
        @for (q of ctx.paper.questions; track q.id; let i = $index) {
          @switch (q.type) {
            @case ('TEXT') {
              <exam-text-answer-grader
                [sessionId]="s.id"
                [question]="q"
                [label]="'Q' + (i + 1)"
                [rubric]="ctx.key.rubrics[q.id]"
                [answer]="asText(s.answers[q.id])"
                [grade]="s.manualScores[q.id]"
                [storedSuggestion]="s.aiSuggestions[q.id]"
              />
            }
            @default {
              @let given = s.answers[q.id];
              @let correct = ctx.key.answers[q.id];
              <div class="choice">
                <h4>Q{{ i + 1 }} · multiple choice · {{ q.points }} pts</h4>
                <p class="prompt">{{ q.prompt }}</p>
                <p>
                  Answered: <strong>{{ optionText(q, given) }}</strong>
                  @if (given === correct) {
                    <span class="ok">✓ correct</span>
                  } @else {
                    <span class="bad">✗ correct answer: {{ optionText(q, correct) }}</span>
                  }
                </p>
              </div>
            }
          }
        }
      } @else {
        <p class="muted" aria-busy="true">Loading questions…</p>
      }
    </section>
  `,
  styles: `
    .review { display: grid; gap: 0.25rem; }
    .review header { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
    h3 { margin: 0.15rem 0; }
    header p { margin: 0; }
    .choice { padding: 1rem 0; border-top: 1px solid var(--border); }
    .choice h4 { margin: 0 0 0.25rem; font-size: 1rem; }
    .choice p { margin: 0.25rem 0; }
    .prompt { white-space: pre-wrap; }
    .ok { color: var(--ok-strong); font-weight: 600; margin-left: 0.5rem; }
    .bad { color: var(--danger); font-weight: 600; margin-left: 0.5rem; }
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

  protected asText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  protected optionText(q: ChoiceQuestion, index: unknown): string {
    return typeof index === 'number' && q.options[index] !== undefined ? q.options[index] : '— no answer —';
  }
}
