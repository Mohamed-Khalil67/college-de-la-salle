import { Component, input, linkedSignal, model, output } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { formatNumber, parseLocalizedNumber, toAppDigits } from './arabic-format';

/**
 * Numeric field that displays Arabic-Indic digits (٠١٢٣) and accepts digits typed in any script.
 * Native `<input type="number">` always renders Latin digits regardless of page language, so it
 * cannot be used in an Arabic-first UI.
 *
 * Signal Forms control: `<exam-number-input [formField]="form.points" inputId="points" />`.
 */
@Component({
  selector: 'exam-number-input',
  template: `
    <input
      type="text"
      [id]="inputId()"
      [attr.inputmode]="allowDecimal() ? 'decimal' : 'numeric'"
      [attr.placeholder]="placeholder() || null"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-invalid]="touched() && invalid()"
      [attr.aria-required]="required()"
      [disabled]="disabled()"
      [value]="text()"
      (input)="onInput($event)"
      (blur)="touch.emit()"
      autocomplete="off"
    />
  `,
  styles: `
    :host { display: block; }
    input { inline-size: 100%; font-variant-numeric: tabular-nums; }
  `,
})
export class ArabicNumberInput implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly required = input(false);
  readonly touch = output<void>();

  readonly inputId = input<string>('');
  readonly describedBy = input<string>('');
  readonly placeholder = input<string>('');
  readonly allowDecimal = input(false);

  /**
   * What the user sees. Follows the model, except while the user is mid-way through typing a value
   * that already parses to the model (e.g. "٢٫" on the way to "٢٫٥") — then their text is kept.
   */
  protected readonly text = linkedSignal<number | null, string>({
    source: this.value,
    computation: (value, previous) =>
      previous && sameNumber(parse(previous.value), value) ? previous.value : display(value),
  });

  protected onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const allowed = this.allowDecimal() ? /[^0-9٠-٩۰-۹.٫]/g : /[^0-9٠-٩۰-۹]/g;
    const cleaned = toAppDigits(el.value.replace(allowed, ''));
    el.value = cleaned;
    this.text.set(cleaned);
    this.value.set(parse(cleaned));
  }
}

function parse(text: string): number | null {
  if (!text.trim()) return null;
  const n = parseLocalizedNumber(text);
  return Number.isFinite(n) ? n : null;
}

function display(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? ''
    : formatNumber(value, { useGrouping: false, maximumFractionDigits: 2 });
}

function sameNumber(a: number | null, b: number | null): boolean {
  return a === b || (a !== null && b !== null && Math.abs(a - b) < 1e-9);
}
