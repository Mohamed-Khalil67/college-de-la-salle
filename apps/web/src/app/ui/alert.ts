import { Component, computed, input } from '@angular/core';
import { Icon } from './icon';

/**
 * A message block. `danger` is announced at once (role="alert", for errors after a submit);
 * the other tones are polite (role="status", for confirmations).
 */
@Component({
  selector: 'cdls-alert',
  imports: [Icon],
  template: `
    <div class="alert" [class]="'alert alert--' + tone()" [attr.role]="role()">
      <cdls-icon [name]="tone() === 'success' ? 'check' : 'alert'" />
      <div><ng-content /></div>
    </div>
  `,
})
export class Alert {
  readonly tone = input<'info' | 'success' | 'warning' | 'danger'>('info');
  protected readonly role = computed(() => (this.tone() === 'danger' ? 'alert' : 'status'));
}
