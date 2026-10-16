import { Component, computed, input, output } from '@angular/core';
import type { TextQuestion } from '@exam/contracts';

/** One written-answer question: a labelled textarea with a live character budget. */
@Component({
  selector: 'exam-text-question-card',
  template: `
    <div class="card" role="group" [attr.aria-labelledby]="'tq-label-' + question().id">
      <div class="head" [id]="'tq-label-' + question().id">
        <span class="index">Question {{ index() + 1 }}</span>
        <span class="points">{{ question().points }} pt{{ question().points === 1 ? '' : 's' }} · written answer</span>
      </div>
      <label class="prompt" [for]="'tq-' + question().id">{{ question().prompt }}</label>
      <textarea
        [id]="'tq-' + question().id"
        rows="6"
        [value]="value()"
        [attr.maxlength]="question().maxLength"
        [disabled]="disabled()"
        [attr.aria-describedby]="'tq-count-' + question().id"
        (input)="typed.emit($any($event.target).value)"
        (change)="typed.emit($any($event.target).value)"
      ></textarea>
      <p class="count" [id]="'tq-count-' + question().id" [class.near]="nearLimit()">
        {{ value().length }} / {{ question().maxLength }} characters
      </p>
    </div>
  `,
  styles: `
    .card { border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; background: var(--surface); display: grid; gap: 0.5rem; }
    .head { display: flex; gap: 0.75rem; align-items: baseline; }
    .index { font-weight: 600; }
    .points { font-size: 0.8rem; color: var(--muted); }
    .prompt { font-size: 1.05rem; font-weight: 400; white-space: pre-wrap; }
    textarea { width: 100%; min-height: 8rem; line-height: 1.5; }
    .count { margin: 0; font-size: 0.8rem; color: var(--muted); text-align: right; }
    .count.near { color: var(--warn-strong); font-weight: 600; }
  `,
})
export class TextQuestionCard {
  readonly question = input.required<TextQuestion>();
  readonly index = input.required<number>();
  readonly value = input('');
  readonly disabled = input(false);
  readonly typed = output<string>();

  protected readonly nearLimit = computed(
    () => this.value().length >= this.question().maxLength * 0.9,
  );
}
