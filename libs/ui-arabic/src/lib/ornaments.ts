import { Component, input } from '@angular/core';

let nextId = 0;

/**
 * Zellige frieze: a band of eight-pointed stars (khatam) — Andalusian tile motif — on teal, gold
 * stars with terracotta hearts. Pure SVG driven by theme tokens, so it follows light/dark mode.
 * Hidden from assistive tech.
 */
@Component({
  selector: 'exam-frieze',
  host: { 'aria-hidden': 'true', class: 'frieze' },
  template: `
    <svg width="100%" [attr.height]="size()" focusable="false">
      <defs>
        <pattern [id]="id" [attr.width]="size()" [attr.height]="size()" patternUnits="userSpaceOnUse">
          <rect [attr.width]="size()" [attr.height]="size()" class="bg" />
          <g [attr.transform]="'translate(' + half() + ' ' + half() + ')'">
            <rect [attr.x]="-arm()" [attr.y]="-arm()" [attr.width]="arm() * 2" [attr.height]="arm() * 2" class="star" />
            <rect
              [attr.x]="-arm()"
              [attr.y]="-arm()"
              [attr.width]="arm() * 2"
              [attr.height]="arm() * 2"
              class="star"
              transform="rotate(45)"
            />
            <circle [attr.r]="size() * 0.14" class="heart" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" [attr.height]="size()" [attr.fill]="'url(#' + id + ')'" />
    </svg>
  `,
  styles: `
    :host { display: block; line-height: 0; }
    .bg { fill: var(--frieze-bg); }
    .star { fill: var(--frieze-star); }
    .heart { fill: var(--frieze-heart); }
  `,
})
export class Frieze {
  readonly size = input(34);
  protected readonly id = `frieze-${nextId++}`;
  protected half(): number {
    return this.size() / 2;
  }
  protected arm(): number {
    return this.size() * 0.26;
  }
}

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
    .c { fill: var(--terracotta); }
  `,
})
export class Star {
  readonly size = input(14);
}
