import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { photo, type SectionPage } from '../../school';
import { Button } from '../../ui';
import { TRACK_SUMMARY } from '../shared/track-summary';

/** `<article siteTrackCard [track]="…">`: one of the two baccalauréats on the home page. */
@Component({
  selector: 'article[siteTrackCard]',
  imports: [NgOptimizedImage, RouterLink, Button],
  host: { class: 'card track-card', '[attr.aria-labelledby]': 'titleId()' },
  template: `
    @let p = image();
    <img class="card__media" [ngSrc]="p.src" [width]="p.width" [height]="p.height" [alt]="p.alt" sizes="(max-width: 64rem) 100vw, 50vw" />
    <div class="card__body">
      <h3 [id]="titleId()" class="t-h1">{{ track().title }}</h3>
      <p class="t-accent">{{ summary().kicker }}</p>
      <ul class="bullets" role="list">
        @for (point of summary().points; track point) {
          <li>{{ point }}</li>
        }
      </ul>
      <p><a cdlsButton variant="secondary" [routerLink]="summary().link">Découvrir le {{ track().title }}</a></p>
    </div>
  `,
  styles: `
    /* The width/height attributes reserve space; height: auto lets aspect-ratio and the width decide. */
    .card__media {
      height: auto;
    }
  `,
})
export class TrackCard {
  readonly track = input.required<SectionPage>();

  protected readonly summary = computed(() => TRACK_SUMMARY[this.track().slug]);
  protected readonly image = computed(() => photo(this.summary().cardPhoto));
  protected readonly titleId = computed(() => `track-${this.track().slug}`);
}
