import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { GalleryImage } from '@exam/data-access-curriculum';

/**
 * Responsive photo grid. `NgOptimizedImage` with explicit width/height reserves each tile's box
 * before the image loads (no layout shift), lazy-loads below the fold, and marks the first tile as
 * high priority when it is above the fold.
 */
@Component({
  selector: 'portal-gallery-grid',
  imports: [NgOptimizedImage],
  template: `
    <ul class="grid" data-testid="gallery">
      @for (image of items(); track image.id; let first = $first) {
        <li>
          <figure>
            <img
              [ngSrc]="image.src"
              [width]="image.width"
              [height]="image.height"
              [alt]="image.alt"
              [priority]="first && priorityFirst()"
              sizes="(max-width: 640px) 100vw, 33vw"
            />
            <figcaption>
              {{ image.caption }}
              @if (image.placeholder) {
                <span class="placeholder">رسم توضيحي</span>
              }
            </figcaption>
          </figure>
        </li>
      }
    </ul>
  `,
  styles: `
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr)); }
    figure { margin: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--surface); }
    img { display: block; inline-size: 100%; block-size: auto; aspect-ratio: 3 / 2; object-fit: cover; }
    figcaption { padding-block: 0.5rem; padding-inline: 0.75rem; font-weight: 600; }
    .placeholder { margin-inline-start: 0.5rem; font-size: 0.8rem; font-weight: 400; color: var(--muted); }
  `,
})
export class GalleryGrid {
  readonly images = input.required<readonly GalleryImage[]>();
  readonly limit = input<number | null>(null);
  readonly priorityFirst = input(false);

  protected readonly items = computed(() => {
    const limit = this.limit();
    return limit === null ? this.images() : this.images().slice(0, limit);
  });
}
