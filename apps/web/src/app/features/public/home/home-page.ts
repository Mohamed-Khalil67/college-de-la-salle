import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../../i18n/locale';
import { pageUrl, type PublicPageId } from '../../../i18n/pages';
import { type ContactId, CONTACTS, type PhotoId, SCHOOL } from '../../../school';
import { Icon } from '../../../shared/ui';
import { ContactForm } from '../shared/contact-form';
import { telHref } from '../../../school/contact-mail';
import { Timeline } from '../shared/timeline';
import { AudienceLinks } from './audience-links';
import { type Feature, FeatureCard } from './feature-card';
import { Hero } from './hero';
import { TrackCard } from './track-card';

const TEASER_YEARS = ['1898', '1905', '1955', '2013'];
const HOME_PHONES: readonly ContactId[] = ['standard', 'bac', 'secondaire'];

/** Photo and link of each « À découvrir » card, in the order of the messages' `home.features`. */
const FEATURE_TARGETS: readonly { readonly photo: PhotoId; readonly page: PublicPageId; readonly fragment: string }[] = [
  { photo: 'chapelle-coupole', page: 'history', fragment: 'annee-1958' },
  { photo: 'entree-1', page: 'bac', fragment: 'inscription' },
  { photo: 'freres-1926', page: 'history', fragment: 'annee-1926' },
];

/** `/`, `/en`, `/ar`: the home page. */
@Component({
  selector: 'site-home-page',
  imports: [RouterLink, Icon, Hero, AudienceLinks, Timeline, TrackCard, FeatureCard, ContactForm],
  template: `
    <section siteHero></section>

    <section siteAudiences></section>

    <section class="section section--subtle" aria-labelledby="histoire-title">
      <div class="container">
        <div class="section__head">
          <div class="section__intro">
            <h2 id="histoire-title" class="t-h1">{{ t.historyTitle }}</h2>
            <p class="t-body-l">{{ t.historyLead }}</p>
          </div>
          <a class="t-label" [routerLink]="links.history">{{ t.historyLink }}</a>
        </div>
        <ol siteTimeline [milestones]="milestones"></ol>
      </div>
    </section>

    <section class="section" aria-labelledby="filieres-title">
      <div class="container">
        <div class="section__head">
          <div class="section__intro">
            <h2 id="filieres-title" class="t-h1">{{ t.tracksTitle }}</h2>
            <p class="t-body-l t-muted">{{ t.tracksLead }}</p>
          </div>
        </div>
        <div class="grid-2">
          @for (s of sections; track s.slug) {
            <article siteTrackCard [track]="s"></article>
          }
        </div>
      </div>
    </section>

    <section class="section section--subtle" aria-labelledby="decouvrir-title">
      <div class="container">
        <div class="section__head">
          <h2 id="decouvrir-title" class="t-h1">{{ t.featuresTitle }}</h2>
        </div>
        <div class="grid-3">
          @for (f of features; track f.photo) {
            <article siteFeatureCard [feature]="f"></article>
          }
        </div>
      </div>
    </section>

    <section class="section section--inverse on-inverse" aria-labelledby="contact-title">
      <div class="container grid-2 split">
        <div class="stack">
          <h2 id="contact-title" class="t-h1">{{ t.contactTitle }}</h2>
          <p class="t-body-l">{{ t.contactLead }}</p>
          <ul class="contact-lines" role="list">
            <li><cdls-icon name="map-pin" /><span>{{ content.school.address }}</span></li>
            <li><cdls-icon name="mail" /><a [href]="'mailto:' + school.email">{{ school.email }}</a></li>
          </ul>
          <dl class="phones">
            @for (c of phones; track c.id) {
              <dt>{{ content.contactLabels[c.id] }}</dt>
              <dd><a class="phone-number" [href]="tel(c.phones[0])">{{ c.phones[0] }}</a></dd>
            }
          </dl>
          <p><a [routerLink]="links.contact">{{ t.allNumbers }}</a></p>
        </div>
        <form siteContactForm [headingLevel]="3"></form>
      </div>
    </section>
  `,
})
export class HomePage {
  readonly #locale = inject(LOCALE);
  protected readonly t = this.#locale.messages.home;
  protected readonly content = this.#locale.content;
  protected readonly school = SCHOOL;
  protected readonly links = { history: pageUrl(this.#locale.lang, 'history'), contact: pageUrl(this.#locale.lang, 'contact') };
  protected readonly sections = [this.content.sections.nationale, this.content.sections.bac];
  protected readonly features: readonly Feature[] = FEATURE_TARGETS.flatMap((target, i) => {
    const words = this.t.features[i];
    if (!words) return [];
    return [{ ...words, photo: target.photo, link: pageUrl(this.#locale.lang, target.page), fragment: target.fragment }];
  });
  protected readonly milestones = this.content.milestones.filter((m) => TEASER_YEARS.includes(m.year));
  protected readonly phones = CONTACTS.filter((c) => HOME_PHONES.includes(c.id));
  protected readonly tel = telHref;
}
