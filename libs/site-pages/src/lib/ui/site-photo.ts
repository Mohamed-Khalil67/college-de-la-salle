import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { Photo } from '@site/content';

/** Tiny blurred stand-in while a photo loads (well under NgOptimizedImage's 4 kB data-URL limit). */
const BLUR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#2a3f63"/><rect y="2" width="4" height="1" fill="#6b5b45"/></svg>',
  );

/**
 * A school photograph with its credit. The image fills a box of fixed aspect ratio, so the page
 * never shifts while it loads; NgOptimizedImage adds lazy loading (or preload when `priority`),
 * `fetchpriority` and the blur placeholder.
 */
@Component({
  selector: 'site-photo',
  imports: [NgOptimizedImage],
  template: `
    @let p = photo();
    <figure class="m-0" lang="fr" dir="ltr">
      <div class="relative overflow-hidden bg-navy-100" [class]="rounded()" [style.aspect-ratio]="ratio()">
        <img
          fill
          [ngSrc]="p.src"
          [alt]="p.alt"
          [priority]="priority()"
          [placeholder]="blur"
          [sizes]="sizes()"
          class="object-cover"
          [style.object-position]="focus()"
        />
      </div>
      @if (caption()) {
        <figcaption class="mt-2 text-sm leading-snug text-muted">
          {{ p.caption }}
          <span class="block text-xs">{{ p.credit }}</span>
        </figcaption>
      }
    </figure>
  `,
})
export class SitePhoto {
  readonly photo = input.required<Photo>();
  /** CSS aspect ratio of the box, e.g. '3 / 2'. Defaults to the photo's own proportions. */
  readonly aspect = input<string | null>(null);
  readonly priority = input(false);
  readonly caption = input(true);
  readonly sizes = input('(max-width: 768px) 100vw, 50vw');
  readonly focus = input('center');
  readonly rounded = input('rounded-xl');

  protected readonly blur = BLUR;
  protected readonly ratio = computed(() => this.aspect() ?? `${this.photo().width} / ${this.photo().height}`);
}
