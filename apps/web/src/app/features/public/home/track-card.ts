import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../../i18n/locale';
import { pageUrl } from '../../../i18n/pages';
import { localizedPhoto, SITE, type SectionPage } from '../../../school';
import { Button } from '../../../shared/ui';

/** `<article siteTrackCard [track]="…">`: one of the two baccalauréats on the home page. */
@Component({
  selector: 'article[siteTrackCard]',
  imports: [NgOptimizedImage, RouterLink, Button],
  host: { class: 'card track-card', '[attr.aria-labelledby]': 'titleId()' },
  template: `
    @let p = image();
    <div class="card__media"><img [ngSrc]="p.src" fill [alt]="p.alt" sizes="(max-width: 64rem) 100vw, 50vw" /></div>
    <div class="card__body">
      <h3 [id]="titleId()" class="t-h1">{{ track().title }}</h3>
      <p class="t-accent">{{ words().kicker }}</p>
      <ul class="bullets" role="list">
        @for (point of words().points; track point) {
          <li>{{ point }}</li>
        }
      </ul>
      <p><a cdlsButton variant="secondary" [routerLink]="link()">{{ discover(track().title) }}</a></p>
    </div>
  `,

})
export class TrackCard {
  readonly track = input.required<SectionPage>();

  readonly #locale = inject(LOCALE);
  protected readonly discover = this.#locale.messages.home.discoverTrack;
  protected readonly summary = computed(() => SITE.trackSummary[this.track().slug]);
  protected readonly words = computed(() => this.#locale.content.tracks[this.track().slug]);
  protected readonly link = computed(() => pageUrl(this.#locale.lang, this.summary().page));
  protected readonly image = computed(() =>
    localizedPhoto(this.summary().cardPhoto, this.#locale.content.photos, this.#locale.content.photoCredits),
  );
  protected readonly titleId = computed(() => `track-${this.track().slug}`);
}
