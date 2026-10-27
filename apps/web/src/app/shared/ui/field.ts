import { Component, Directive, computed, inject, input } from '@angular/core';
import { Icon } from './icon';

let nextId = 0;

/**
 * A labelled form field. The native control is projected and marked with `cdlsControl`, which wires
 * its id, aria-describedby (helper and error) and aria-invalid:
 *
 *   <cdls-field label="Adresse e-mail" helper="…" [error]="emailError()">
 *     <input cdlsControl type="email" [field]="form.email" />
 *   </cdls-field>
 */
@Component({
  selector: 'cdls-field',
  imports: [Icon],
  template: `
    <div class="field">
      <label class="field__label" [attr.for]="controlId">{{ label() }}</label>
      <ng-content />
      @if (helper()) {
        <p class="field__helper" [id]="helperId">{{ helper() }}</p>
      }
      @if (error()) {
        <p class="field__error" [id]="errorId"><cdls-icon name="alert" /><span>{{ error() }}</span></p>
      }
    </div>
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly helper = input('');
  /** Shown under the control and announced with it; say what is wrong and how to fix it. */
  readonly error = input<string | null>(null);

  readonly controlId = `cdls-field-${++nextId}`;
  readonly helperId = `${this.controlId}-help`;
  readonly errorId = `${this.controlId}-error`;

  readonly describedBy = computed(
    () => [this.helper() ? this.helperId : '', this.error() ? this.errorId : ''].filter(Boolean).join(' ') || null,
  );
}

/** The native input, select or textarea inside a `cdls-field`. */
@Directive({
  selector: 'input[cdlsControl], select[cdlsControl], textarea[cdlsControl]',
  host: {
    class: 'field__control',
    '[id]': 'field.controlId',
    '[attr.aria-describedby]': 'field.describedBy()',
    '[attr.aria-invalid]': 'field.error() ? "true" : null',
  },
})
export class FieldControl {
  protected readonly field = inject(Field);
}
