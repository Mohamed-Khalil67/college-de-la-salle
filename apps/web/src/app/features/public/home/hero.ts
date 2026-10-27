import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../../i18n/locale';
import { pageUrl } from '../../../i18n/pages';
import { localizedPhoto } from '../../../school';
import { Button } from '../../../shared/ui';

/** `<section siteHero>`: the campus from the air under a navy scrim, with the page's h1. */
@Component({
  selector: 'section[siteHero]',
  imports: [NgOptimizedImage, RouterLink, Button],
  host: { class: 'hero on-inverse', 'aria-labelledby': 'hero-title' },
  template: `
    <img class="hero__media" [ngSrc]="campus.src" [width]="campus.width" [height]="campus.height" [alt]="campus.alt" priority sizes="100vw" />
    <div class="container">
      <div class="hero__content">
        <hr class="gold-rule" />
        <h1 id="hero-title" class="t-display-xl">{{ t.heroTitle }}</h1>
        <p class="t-body-l">{{ t.heroLead }}</p>
        <div class="hero__actions">
          <a cdlsButton variant="on-dark" [routerLink]="links.contact">{{ prepare }}</a>
          <a class="t-label" [routerLink]="links.history">{{ t.heroHistory }}</a>
        </div>
      </div>
    </div>
    <p class="hero__credit">{{ t.heroCredit }} {{ campus.credit }}.</p>
  `,
})
export class Hero {
  readonly #locale = inject(LOCALE);
  protected readonly t = this.#locale.messages.home;
  protected readonly prepare = this.#locale.messages.common.prepareRegistration;
  protected readonly links = { contact: pageUrl(this.#locale.lang, 'contact'), history: pageUrl(this.#locale.lang, 'history') };
  protected readonly campus = localizedPhoto('campus-aerien', this.#locale.content.photos, this.#locale.content.photoCredits);
}
