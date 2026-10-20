import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { FORMAT_MARK } from '@cdls/shared';
import { isValidMark, parseMark } from './marks';

/**
 * One cell of the grade grid. Accepts a decimal comma, validates 0 to `outOf` and sets aria-invalid;
 * the row's error message lives outside the cell (pass its id as `describedBy`).
 */
@Component({
  selector: 'cdls-grade-input',
  template: `
    <input
      class="grade-input"
      inputmode="decimal"
      autocomplete="off"
      [attr.aria-label]="label()"
      [attr.aria-describedby]="invalid() ? describedBy() : null"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [value]="text()"
      (input)="onInput($any($event.target).value)"
    />
  `,
})
export class GradeInput {
  readonly value = model<number | null>(null);
  readonly outOf = input(20);
  readonly label = input.required<string>();
  readonly describedBy = input<string | null>(null);

  /** What the teacher typed; follows the value when it changes from outside. */
  protected readonly text = linkedSignal(() => {
    const value = this.value();
    return value === null || Number.isNaN(value) ? '' : FORMAT_MARK.format(value);
  });
  readonly invalid = computed(() => !isValidMark(parseMark(this.text()), this.outOf()));

  protected onInput(text: string): void {
    this.text.set(text);
    this.value.set(parseMark(text));
  }
}
