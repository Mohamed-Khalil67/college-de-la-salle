import { Component, computed, input, output } from '@angular/core';
import type { TextQuestion } from '@exam/contracts';
import { ArCountPipe, ArNumberPipe, BidiIsolate } from '@exam/ui-arabic';

/** One written-answer question: a labelled textarea with a live character budget. */
@Component({
  selector: 'exam-text-question-card',
  imports: [ArNumberPipe, ArCountPipe, BidiIsolate],
  template: `
    <div class="card" role="group" [attr.aria-labelledby]="'tq-label-' + question().id">
      <div class="head" [id]="'tq-label-' + question().id">
        <span class="index">السؤال {{ index() + 1 | arNumber }}</span>
        <span class="points">{{ question().points | arCount: 'point' }} · إجابة مقالية</span>
      </div>
      <label class="prompt exam-text" [for]="'tq-' + question().id" examIsolate>{{ question().prompt }}</label>
      <textarea
        [id]="'tq-' + question().id"
        rows="6"
        dir="auto"
        placeholder="اكتب إجابتك هنا…"
        [value]="value()"
        [attr.maxlength]="question().maxLength"
        [disabled]="disabled()"
        [attr.aria-describedby]="'tq-count-' + question().id"
        (input)="typed.emit($any($event.target).value)"
        (change)="typed.emit($any($event.target).value)"
      ></textarea>
      <p class="count" [id]="'tq-count-' + question().id" [class.near]="nearLimit()">
        {{ value().length | arNumber }} من {{ question().maxLength | arCount: 'character' }}
      </p>
    </div>
  `,
  styles: `
    .card { border: 1px solid var(--border); border-radius: var(--radius); padding-block: 1.1rem 1.35rem; padding-inline: 1.35rem; background: var(--surface); display: grid; gap: 0.5rem; }
    .head { display: flex; gap: 0.75rem; align-items: baseline; }
    .index { font-family: var(--font-display); font-weight: 700; font-size: 1.2rem; color: var(--accent-strong); }
    .points { font-size: 0.85rem; color: var(--muted); }
    .prompt { font-weight: 400; }
    textarea { inline-size: 100%; min-block-size: 9rem; font-family: var(--font-text); font-size: 1.1rem; }
    .count { margin: 0; font-size: 0.85rem; color: var(--muted); text-align: end; }
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
