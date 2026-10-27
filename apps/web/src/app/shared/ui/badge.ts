import { Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'heritage';

/** A short status label. The words carry the meaning; the colour only supports it. */
@Component({
  selector: 'cdls-badge',
  template: `<span class="badge" [class]="'badge badge--' + tone()"><ng-content /></span>`,
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');
}
