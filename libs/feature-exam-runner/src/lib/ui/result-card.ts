import { Component, computed, input } from '@angular/core';
import type { ExamResult } from '@exam/contracts';
import { ArNumberPipe, ArScorePipe, BidiIsolate, formatPercent, Star } from '@exam/ui-arabic';

/** The candidate's released result: verdict, score, percentage and written-answer feedback. */
@Component({
  selector: 'exam-result-card',
  imports: [ArNumberPipe, ArScorePipe, BidiIsolate, Star],
  template: `
    @let r = result();
    <section class="result" aria-labelledby="result-title" data-testid="result">
      <h2 id="result-title">نتيجتك</h2>
      @if (r.passed === true) {
        <p class="verdict pass"><exam-star [size]="22" /> ناجح، مبارك!</p>
      } @else if (r.passed === false) {
        <p class="verdict fail">لم تبلغ درجة النجاح هذه المرة.</p>
      }
      <dl class="figures">
        <div>
          <dt>الدرجة</dt>
          <dd data-testid="result-score">{{ r.score | arScore: r.maxScore }}</dd>
        </div>
        <div>
          <dt>النسبة المئوية</dt>
          <dd>{{ percent() }}</dd>
        </div>
        @if (r.passPercent !== null) {
          <div>
            <dt>درجة النجاح</dt>
            <dd>{{ passMark() }}</dd>
          </div>
        }
      </dl>
      @if (r.feedback.length) {
        <h3>ملاحظات المُمتحِن</h3>
        <ul class="feedback">
          @for (f of r.feedback; track f.questionNumber) {
            <li>
              <strong>السؤال {{ f.questionNumber | arNumber }}</strong>
              <span class="muted"> · {{ f.points | arScore: f.maxPoints }}</span>
              @if (f.feedback) {
                <p class="exam-text" examIsolate>{{ f.feedback }}</p>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .result { margin-block-start: 1.25rem; padding-block-start: 1.25rem; border-block-start: 1px solid var(--border); text-align: start; }
    h2 { margin-block: 0 0.5rem; }
    h3 { font-size: 1.15rem; margin-block: 1rem 0.25rem; }
    .verdict { display: flex; align-items: center; gap: 0.5rem; font-size: 1.3rem; font-weight: 600; margin: 0; }
    .pass { color: var(--ok-strong); }
    .fail { color: var(--warn-strong); }
    .figures { display: flex; flex-wrap: wrap; gap: 2rem; margin-block: 1rem 0; }
    .figures dt { font-size: 0.85rem; color: var(--muted); }
    .figures dd { margin: 0; font-size: 1.5rem; font-weight: 600; color: var(--accent-strong); }
    .feedback { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
    .feedback p { margin-block: 0.25rem 0; }
  `,
})
export class ResultCard {
  readonly result = input.required<ExamResult>();

  protected readonly percent = computed(() => formatPercent(this.result().percent));
  protected readonly passMark = computed(() => formatPercent(this.result().passPercent ?? 0));
}
