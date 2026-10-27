import { Component, inject } from '@angular/core';
import { LOCALE } from '../../../i18n/locale';
import { CONTACTS, SCHOOL } from '../../../school';
import { Icon } from '../../../shared/ui';
import { Breadcrumb } from '../shared/breadcrumb';
import { ContactForm } from '../shared/contact-form';
import { telHref } from '../../../school/contact-mail';

/** `/contact`: the form to the secretariat, the address and every phone number by department. */
@Component({
  selector: 'site-contact-page',
  imports: [Icon, Breadcrumb, ContactForm],
  template: `
    <section class="section section--subtle page-intro page-intro--compact" aria-labelledby="page-title">
      <div class="container stack">
        <nav siteBreadcrumb [current]="t.contact.title"></nav>
        <h1 id="page-title" class="t-display-l">{{ t.contact.title }}</h1>
        <p class="t-body-l prose-width">{{ t.contact.lead }}</p>
      </div>
    </section>

    <div class="section">
      <div class="container content-grid">
        <form siteContactForm class="form-card--outlined" [full]="true"></form>

        <aside class="stack" [attr.aria-label]="t.contact.details">
          <section class="card card--panel" aria-labelledby="s-title">
            <h2 id="s-title" class="t-h3">{{ t.contact.office }}</h2>
            <ul class="contact-lines contact-lines--light" role="list">
              <li>
                <cdls-icon name="map-pin" />
                <span
                  ><span lang="fr">{{ school.name }}</span>, {{ content.school.address }}.
                  <a [href]="mapUrl">{{ t.contact.seeOnMap }}</a></span
                >
              </li>
              <li><cdls-icon name="mail" /><a [href]="'mailto:' + school.email">{{ school.email }}</a></li>
            </ul>
          </section>

          <section class="card card--panel" aria-labelledby="t-title">
            <h2 id="t-title" class="t-h3">{{ t.contact.phonesTitle }}</h2>
            <dl class="phone-list">
              @for (c of contacts; track c.id) {
                <div>
                  <dt>{{ content.contactLabels[c.id] }}</dt>
                  @for (p of c.phones; track p) {
                    <dd><a class="phone-number" [href]="tel(p)">{{ p }}</a></dd>
                  }
                </div>
              }
            </dl>
          </section>

          <section class="card card--panel" aria-labelledby="i-title">
            <h2 id="i-title" class="t-h3">{{ t.contact.registrationTitle }}</h2>
            <p class="t-body-s">{{ t.contact.registrationNationale }}</p>
            <a class="t-label" [href]="nationaleLink.url">{{ t.contact.registrationNationaleLink }}</a>
            <p class="t-body-s">{{ t.contact.registrationBac }}</p>
            <ul class="stack stack--sm" role="list">
              @for (l of bacForms; track l.url) {
                <li><a class="t-label" [href]="l.url">{{ l.label }}</a></li>
              }
            </ul>
          </section>

          <section class="card card--panel" aria-labelledby="l-title">
            <h2 id="l-title" class="t-h3">{{ t.contact.sitesTitle }}</h2>
            <ul class="stack stack--sm" role="list">
              @for (l of content.links; track l.url) {
                <li>
                  <a class="t-label" [href]="l.url">{{ l.label }}</a>
                  <span class="d-block t-body-s t-muted">{{ l.note }}</span>
                </li>
              }
            </ul>
          </section>
        </aside>
      </div>
    </div>
  `,
  styles: `
    .phone-list > div {
      flex-direction: column;
    }
    @media (min-width: 30rem) {
      .phone-list > div {
        display: grid;
        grid-template-columns: minmax(0, 1fr) max-content;
      }
      .phone-list dd {
        grid-column: 2;
      }
    }
  `,
})
export class ContactPage {
  readonly #locale = inject(LOCALE);
  protected readonly t = this.#locale.messages;
  protected readonly content = this.#locale.content;
  protected readonly school = SCHOOL;
  protected readonly contacts = CONTACTS;
  protected readonly nationaleLink = this.content.sections.nationale.links[0];
  protected readonly bacForms = this.content.sections.bac.links.filter((l) => l.registration);
  protected readonly tel = telHref;
  protected readonly mapUrl =
    'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Collège De La Salle, El-Zaher, Cairo');
}
