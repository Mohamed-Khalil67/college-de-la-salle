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
    @if (aspect(); as ratio) {
      <!-- Cropped on purpose: the frame has the ratio, the photo fills it (fill mode, object-fit: cover). -->
      <div class="photo-frame" [style.aspect-ratio]="ratio">
        <img [ngSrc]="p.src" fill [alt]="p.alt" [priority]="priority()" [sizes]="sizes()" />
      </div>
    } @else {
      <img [ngSrc]="p.src" [width]="p.width" [height]="p.height" [alt]="p.alt" [priority]="priority()" [sizes]="sizes()" />
    }
    <figcaption class="t-caption t-muted">
      @if (caption()) {
        {{ p.caption }}
      }
      {{ p.credit }}.
    </figcaption>
  `,
  styles: `
    /* Uncropped: the width/height attributes reserve the space and height: auto keeps the photo's own proportions. */
    :host > img {
      width: 100%;
      height: auto;
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
  /** Crop to this CSS aspect ratio (e.g. '4 / 3') in a frame; the photo's own proportions, uncropped, when null. */
  readonly aspect = input<string | null>(null);
}
