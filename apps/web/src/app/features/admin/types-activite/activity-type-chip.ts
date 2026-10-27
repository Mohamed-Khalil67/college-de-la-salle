import { Component, computed, input } from '@angular/core';
import type { ActivityColour, ActivityIcon } from '@cdls/shared';
import { Icon } from '../../../shared/ui';
import { swatchOf } from './activity-palette';

/**
 * An activity type as people see it: its icon and its name on a tint, with a border of the type's colour.
 * The colour is never the only cue: the name is always there, and the icon repeats it.
 */
@Component({
  selector: 'app-activity-type-chip',
  imports: [Icon],
  template: `<span class="type-chip__icon"><cdls-icon [name]="icon()" /></span><span>{{ label() }}</span>`,
  host: {
    class: 'type-chip',
    '[style.--chip-solid]': 'swatch().solid',
    '[style.--chip-tint]': 'swatch().tint',
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-3);
      border: 2px solid var(--chip-solid);
      border-radius: var(--radius-full);
      background: var(--chip-tint);
      color: var(--color-body);
      font-size: var(--text-body-s);
      font-weight: 500;
      line-height: 1.4;
      max-width: 100%;
    }
    .type-chip__icon {
      display: inline-flex;
      color: var(--chip-solid);
      flex: none;
    }
  `,
})
export class ActivityTypeChip {
  readonly colour = input.required<ActivityColour | string>();
  readonly icon = input.required<ActivityIcon>();
  readonly label = input.required<string>();

  protected readonly swatch = computed(() => swatchOf(this.colour()));
}
