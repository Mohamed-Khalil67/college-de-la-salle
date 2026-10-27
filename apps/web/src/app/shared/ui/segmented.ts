import { Component, input, model } from '@angular/core';

export interface SegmentOption {
  readonly value: string;
  readonly label: string;
}

let nextId = 0;

/** A radio group drawn as segments (attendance status). Native radios: arrow keys work out of the box. */
@Component({
  selector: 'cdls-segmented',
  template: `
    <fieldset class="segmented-group">
      <legend class="visually-hidden">{{ legend() }}</legend>
      <div class="segmented">
        @for (option of options(); track option.value) {
          <label>
            <input type="radio" [name]="name" [value]="option.value" [checked]="option.value === value()" (change)="value.set(option.value)" />
            <span>{{ option.label }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .segmented-group {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
  `,
})
export class Segmented {
  readonly legend = input.required<string>();
  readonly options = input.required<readonly SegmentOption[]>();
  readonly value = model<string | null>(null);
  protected readonly name = `cdls-seg-${++nextId}`;
}
