import { Component, computed, input, output } from '@angular/core';
import type { AnswerValue, ChoiceQuestion } from '@exam/contracts';
import { ArCountPipe, ArNumberPipe, BidiIsolate } from '@exam/ui-arabic';
import { FlagToggle } from './flag-toggle';

export interface AnswerChange {
  readonly questionId: string;
  readonly option: number;
}

/** Abjad letters label options in Arabic exams: أ ب ج د هـ و ز ح. */
const ABJAD = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];

/** One multiple-choice question as a native radio group (keyboard + screen-reader friendly). */
@Component({
  selector: 'exam-question-card',
  imports: [ArNumberPipe, ArCountPipe, BidiIsolate, FlagToggle],
  template: `
    <fieldset class="card" [disabled]="disabled()">
      <legend>
        <span class="index">السؤال {{ index() + 1 | arNumber }}</span>
        <span class="points">{{ question().points | arCount: 'point' }}</span>
      </legend>
      <exam-flag-toggle class="flag" [flagged]="flagged()" [disabled]="disabled()" (toggled)="flagToggled.emit()" />
      <p class="prompt exam-text" examIsolate>{{ question().prompt }}</p>
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
            <span class="letter" aria-hidden="true">{{ abjad[$index] }}</span>
            <span class="text" examIsolate>{{ option }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .card { border: 1px solid var(--border); border-radius: var(--radius); padding-block: 1.1rem 1.35rem; padding-inline: 1.35rem; margin: 0; background: var(--surface); }
    legend { display: flex; gap: 0.75rem; align-items: baseline; padding-inline: 0.4rem; }
    .index { font-family: var(--font-display); font-weight: 700; font-size: 1.2rem; color: var(--accent-strong); }
    .points { font-size: 0.85rem; color: var(--muted); }
    .flag { display: block; text-align: end; }
    .prompt { margin-block: 0.25rem 1rem; }
    .options { display: grid; gap: 0.55rem; }
    .option {
      display: flex; gap: 0.75rem; align-items: center; font-weight: 400; font-size: 1.05rem;
      padding-block: 0.6rem; padding-inline: 0.85rem; cursor: pointer;
      border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px);
    }
    .option.selected { border-color: var(--accent); background: var(--accent-soft); }
    .option:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
    .letter { font-family: var(--font-display); font-weight: 700; color: var(--terracotta-strong); min-inline-size: 1.5em; text-align: center; }
    .text { font-family: var(--font-text); line-height: var(--leading-text); flex: 1; }
    input { accent-color: var(--accent); inline-size: 1.1rem; block-size: 1.1rem; margin: 0; }
  `,
})
export class QuestionCard {
  readonly question = input.required<ChoiceQuestion>();
  readonly index = input.required<number>();
  /** The candidate's stored answer; only an option index counts as a selection. */
  readonly answer = input<AnswerValue>();
  protected readonly selected = computed(() => {
    const answer = this.answer();
    return typeof answer === 'number' ? answer : undefined;
  });
  readonly disabled = input(false);
  readonly answered = output<AnswerChange>();
  readonly flagged = input(false);
  readonly flagToggled = output<void>();

  protected readonly abjad = ABJAD;
}
