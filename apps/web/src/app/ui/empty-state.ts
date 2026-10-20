import { Component, input } from '@angular/core';
import { Icon, type IconName } from './icon';

/** Says what will appear here and offers the next step (projected action). */
@Component({
  selector: 'cdls-empty-state',
  imports: [Icon],
  template: `
    <div class="empty-state">
      <div class="empty-state__icon"><cdls-icon [name]="icon()" /></div>
      <h2 class="t-h3">{{ title() }}</h2>
      @if (description()) {
        <p>{{ description() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input<IconName>('search');
}
