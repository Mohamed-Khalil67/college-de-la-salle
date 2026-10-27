import { NgOptimizedImage } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { LOCALE } from '../../../i18n/locale';
import { localizedPhoto, type Milestone, type PhotoId } from '../../../school';

/**
 * `<ol siteTimeline [milestones]="…">`: the site's signature. Brick Garamond years on a gold rule with
 * Lasallian star markers, next to archive photographs.
 *
 * - `row` (home): four columns on a horizontal rule, photos cropped to 16:10.
 * - `full` (history page): one column on a vertical rule, the photo beside the text on wide
 *   screens and never cropped (the 1926 group photo is a panorama), with the source of each date.
 *   Each item has an id (`annee-1926`) so other pages can link to it.
 */
@Component({
  selector: 'ol[siteTimeline]',
  imports: [NgOptimizedImage],
  host: { class: 'timeline', role: 'list', '[class.timeline--full]': 'variant() === "full"' },
  template: `
    @for (m of milestones(); track m.year) {
      <li class="timeline__item" [id]="variant() === 'full' ? 'annee-' + m.year : null">
        <svg class="timeline__star" aria-hidden="true" focusable="false"><use href="/icons.svg#star-marker" /></svg>
        <p class="timeline__year">{{ m.year }}</p>
        <h3 class="t-h3">{{ m.title }}</h3>
        <p class="t-body-s t-muted">{{ m.text }}</p>
        @if (variant() === 'full') {
          <p class="t-caption t-muted">{{ sourceLabel }} {{ m.source }}</p>
        }
        @if (m.photo; as id) {
          @let p = photoOf(id);
          <figure>
            <img
              [ngSrc]="p.src"
              [width]="p.width"
              [height]="p.height"
              [alt]="p.alt"
              [sizes]="sizes()"
              [style.aspect-ratio]="variant() === 'full' ? p.width + ' / ' + p.height : null"
            />
            <figcaption class="t-caption t-muted">{{ p.credit }}.</figcaption>
          </figure>
        }
      </li>
    }
  `,
  styles: `
    /* The width/height attributes reserve space; height: auto lets aspect-ratio and the width decide. */
    img {
      height: auto;
    }
    :host(.timeline--full) {
      grid-template-columns: 1fr;
      gap: var(--space-12);
      padding-top: 0;
      padding-inline-start: var(--space-12);
    }
    :host(.timeline--full)::before {
      top: 0;
      bottom: 0;
      inset-inline-start: 0.6rem;
      inset-inline-end: auto;
      width: 1.5px;
      height: auto;
    }
    :host(.timeline--full) .timeline__item {
      scroll-margin-top: var(--space-6);
    }
    :host(.timeline--full) .timeline__star {
      top: 0.9rem;
      inset-inline-start: calc(-1 * var(--space-12));
    }
    @media (min-width: 56.0625rem) {
      :host(.timeline--full) .timeline__item {
        grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
        column-gap: var(--space-12);
      }
      :host(.timeline--full) .timeline__item > :not(figure, svg) {
        grid-column: 1;
      }
      :host(.timeline--full) figure {
        grid-column: 2;
        grid-row: 1 / span 5;
      }
      :host(.timeline--full) figure img {
        margin-top: 0;
      }
    }
    @media (max-width: 56rem) {
      :host(.timeline--full) {
        padding-inline-start: var(--space-8);
      }
      :host(.timeline--full) .timeline__star {
        top: 0.75rem;
        inset-inline-start: calc(-1 * var(--space-8));
      }
    }
  `,
})
export class Timeline {
  readonly milestones = input.required<readonly Milestone[]>();
  readonly variant = input<'row' | 'full'>('row');
  readonly sizes = input('(max-width: 56rem) 100vw, 25vw');
  readonly #locale = inject(LOCALE);
  protected readonly sourceLabel = this.#locale.messages.common.source;
  protected readonly photoOf = (id: PhotoId) => localizedPhoto(id, this.#locale.content.photos, this.#locale.content.photoCredits);
}
