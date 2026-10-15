import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

/**
 * Renders a field's validation messages once the user has interacted with it. Give the host an
 * `id` and point the control's `aria-describedby` at it.
 */
@Component({
  selector: 'exam-field-errors',
  host: { class: 'field-error', 'aria-live': 'polite' },
  template: `
    @if (visible()) {
      @for (error of field()().errors(); track $index) {
        <span>{{ error.message ?? 'Invalid value.' }}</span>
      }
    }
  `,
  styles: `
    :host { display: block; }
    span + span::before { content: ' '; }
  `,
})
export class FieldErrors {
  readonly field = input.required<FieldTree<unknown>>();
  /** Force display (e.g. after a submit attempt) even if untouched. */
  readonly force = input(false);

  protected readonly visible = computed(() => this.force() || this.field()().touched());
}
