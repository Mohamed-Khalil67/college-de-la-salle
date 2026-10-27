import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';
import type { Photo } from '../../../school';

/**
 * `<figure sitePhoto [photo]="p">`: a school photograph with its caption and credit. Every photo on
 * the site shows its credit (docs/brand.md). Width and height come from the file, so nothing shifts.
 */
@Component({
  selector: 'figure[sitePhoto]',
  imports: [NgOptimizedImage],
  template: `
    @let p = photo();
    <img [ngSrc]="p.src" [width]="p.width" [height]="p.height" [alt]="p.alt" [priority]="priority()" [sizes]="sizes()" [style.aspect-ratio]="aspect()" />
    <figcaption class="t-caption t-muted">
      @if (caption()) {
        {{ p.caption }}
      }
      {{ p.credit }}.
    </figcaption>
  `,
  styles: `
    /* The width/height attributes reserve space; height: auto lets aspect-ratio and the width decide. */
    img {
      width: 100%;
      height: auto;
      object-fit: cover;
      border-radius: var(--radius-sm);
      background: var(--color-info-tint);
    }
    figcaption {
      margin-top: var(--space-2);
    }
  `,
})
export class PhotoFigure {
  readonly photo = input.required<Photo>();
  readonly priority = input(false);
  /** Show the photo's caption before the credit. */
  readonly caption = input(true);
  readonly sizes = input('(max-width: 64rem) 100vw, 50vw');
  /** Crop to this CSS aspect ratio (e.g. '4 / 3'); the photo's own proportions when null. */
  readonly aspect = input<string | null>(null);
}
