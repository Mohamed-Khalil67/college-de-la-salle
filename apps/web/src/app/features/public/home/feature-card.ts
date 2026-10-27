import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../../i18n/locale';
import { localizedPhoto, type PhotoId } from '../../../school';

/** One « À découvrir » entry on the home page: a news-style card whose title link covers the card. */
export interface Feature {
  readonly photo: PhotoId;
  readonly meta: string;
  readonly title: string;
  readonly text: string;
  /** The page's address in the current language. */
  readonly link: string;
  readonly fragment?: string;
}

/** `<article siteFeatureCard [feature]="…">` (`.card--news` in the prototypes). */
@Component({
  selector: 'article[siteFeatureCard]',
  imports: [NgOptimizedImage, RouterLink],
  host: { class: 'card card--news' },
  template: `
    @let f = feature();
    @let p = image();
    <img class="card__media" [ngSrc]="p.src" [width]="p.width" [height]="p.height" [alt]="p.alt" sizes="(max-width: 64rem) 100vw, 33vw" />
    <div class="card__body">
      <p class="t-caption t-muted">{{ f.meta }}</p>
      <h3 class="t-h3 card__title">
        <a [routerLink]="f.link" [fragment]="f.fragment">{{ f.title }}</a>
      </h3>
      <p class="t-body-s t-muted">{{ f.text }}</p>
    </div>
  `,
  styles: `
    /* The width/height attributes reserve space; height: auto lets aspect-ratio and the width decide. */
    .card__media {
      height: auto;
    }
  `,
})
export class FeatureCard {
  readonly feature = input.required<Feature>();
  readonly #content = inject(LOCALE).content;
  protected readonly image = computed(() => localizedPhoto(this.feature().photo, this.#content.photos, this.#content.photoCredits));
}
