import { Component, computed, inject, input, model, resource } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Field, FieldControl } from '../../shared/ui';

/**
 * « Groupe » of a timetable session: the whole class, or one of the class's groups (the division is then the
 * group's). A small select inside a labelled field; it lists nothing until a class is chosen.
 */
@Component({
  selector: 'app-group-select',
  imports: [Field, FieldControl],
  template: `
    <cdls-field [label]="label()" [helper]="helper()">
      <select cdlsControl [value]="value()" (change)="value.set($any($event.target).value)" [disabled]="!classId()">
        <option value="" [selected]="!value()">Toute la classe</option>
        @for (g of groups(); track g.id) {
          <option [value]="g.id" [selected]="g.id === value()">{{ g.division }} : {{ g.label }}</option>
        }
      </select>
    </cdls-field>
  `,
})
export class GroupSelect {
  /** The class whose groups are offered. */
  readonly classId = input<string>('');
  /** The group id, or '' for the whole class. */
  readonly value = model('');
  readonly label = input('Groupe');
  readonly helper = input('Vide : toute la classe. La division est celle du groupe.');

  readonly #api = inject(ApiClient);
  readonly #groups = resource({
    params: () => this.classId() || undefined,
    loader: ({ params }) => this.#api.groups.list(params),
  });
  protected readonly groups = computed(() => (this.#groups.hasValue() ? this.#groups.value() : []));
}
