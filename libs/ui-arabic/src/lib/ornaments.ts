import { Component, input } from '@angular/core';

/** Single eight-pointed star — section ornament. */
@Component({
  selector: 'exam-star',
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="-10 -10 20 20" [attr.width]="size()" [attr.height]="size()" focusable="false">
      <rect x="-6" y="-6" width="12" height="12" class="s" />
      <rect x="-6" y="-6" width="12" height="12" class="s" transform="rotate(45)" />
      <circle r="2.6" class="c" />
    </svg>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; vertical-align: middle; }
    .s { fill: var(--gold); }
    .c { fill: var(--primary); }
  `,
})
export class Star {
  readonly size = input(14);
}
