import { Component, input } from '@angular/core';

export type IconName =
  | 'menu' | 'close' | 'chevron-down' | 'chevron-right' | 'chevron-left' | 'search' | 'calendar' | 'user'
  | 'users' | 'upload' | 'download' | 'book' | 'check' | 'alert' | 'plus' | 'bell' | 'map-pin' | 'mail'
  | 'phone' | 'clock' | 'file-text' | 'more' | 'log-out' | 'home' | 'edit' | 'eye' | 'printer' | 'filter';

/** A line icon from /icons.svg. Decorative: the text next to it (or a visually hidden label) carries the meaning. */
@Component({
  selector: 'cdls-icon',
  template: `<svg class="icon" aria-hidden="true" focusable="false"><use [attr.href]="'/icons.svg#i-' + name()" /></svg>`,
})
export class Icon {
  readonly name = input.required<IconName>();
}
