import { Component, input, output } from '@angular/core';
import type { ChoiceQuestion } from '@exam/contracts';

export interface AnswerChange {
  readonly questionId: string;
  readonly option: number;
}

/** One multiple-choice question as a native radio group (keyboard + screen-reader friendly). */
@Component({
  selector: 'exam-question-card',
  template: `
    <fieldset class="card" [disabled]="disabled()">
      <legend>
        <span class="index">Question {{ index() + 1 }}</span>
        <span class="points">{{ question().points }} pt{{ question().points === 1 ? '' : 's' }}</span>
      </legend>
      <p class="prompt">{{ question().prompt }}</p>
      <div class="options">
        @for (option of question().options; track $index) {
          <label class="option" [class.selected]="selected() === $index">
            <input
              type="radio"
              [name]="'q-' + question().id"
              [value]="$index"
              [checked]="selected() === $index"
              (change)="answered.emit({ questionId: question().id, option: $index })"
            />
            <span>{{ option }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .card { border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; margin: 0; background: var(--surface); }
    legend { display: flex; gap: 0.75rem; align-items: baseline; padding: 0 0.25rem; }
    .index { font-weight: 600; }
    .points { font-size: 0.8rem; color: var(--muted); }
    .prompt { margin: 0.25rem 0 1rem; font-size: 1.05rem; white-space: pre-wrap; }
    .options { display: grid; gap: 0.5rem; }
    .option { display: flex; gap: 0.75rem; align-items: center; padding: 0.65rem 0.85rem; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); cursor: pointer; }
    .option.selected { border-color: var(--accent); background: var(--accent-soft); }
    .option:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
    input { accent-color: var(--accent); width: 1.1rem; height: 1.1rem; }
  `,
})
export class QuestionCard {
  readonly question = input.required<ChoiceQuestion>();
  readonly index = input.required<number>();
  readonly selected = input<number | undefined>(undefined);
  readonly disabled = input(false);
  readonly answered = output<AnswerChange>();
}
