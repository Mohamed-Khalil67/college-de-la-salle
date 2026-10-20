import { Component } from '@angular/core';
import { BAC, CONTACTS, NATIONALE, SCHOOL, SCHOOL_LINKS } from '../../school';
import { Icon } from '../../ui';
import { Breadcrumb } from '../shared/breadcrumb';
import { ContactForm } from '../shared/contact-form';
import { telHref } from '../shared/contact-mail';

/** `/contact`: the form to the secretariat, the address and every phone number by department. */
@Component({
  selector: 'site-contact-page',
  imports: [Icon, Breadcrumb, ContactForm],
  template: `
    <section class="section section--subtle page-intro page-intro--compact" aria-labelledby="page-title">
      <div class="container stack">
        <nav siteBreadcrumb current="Contact"></nav>
        <h1 id="page-title" class="t-display-l">Contact et inscriptions</h1>
        <p class="t-body-l prose-width">
          Une question sur la scolarité ou une demande d’inscription ? Écrivez au secrétariat ou appelez directement le
          cycle concerné.
        </p>
      </div>
    </section>

    <div class="section">
      <div class="container content-grid">
        <form siteContactForm class="form-card--outlined" [full]="true"></form>

        <aside class="stack" aria-label="Coordonnées">
          <section class="card card--panel" aria-labelledby="s-title">
            <h2 id="s-title" class="t-h3">Secrétariat</h2>
            <ul class="contact-lines contact-lines--light" role="list">
              <li>
                <cdls-icon name="map-pin" />
                <span>{{ school.name }}, {{ school.address }}. <a [href]="mapUrl">Voir sur la carte</a></span>
              </li>
              <li><cdls-icon name="mail" /><a [href]="'mailto:' + school.email">{{ school.email }}</a></li>
            </ul>
          </section>

          <section class="card card--panel" aria-labelledby="t-title">
            <h2 id="t-title" class="t-h3">Téléphones par service</h2>
            <dl class="phone-list">
              @for (c of contacts; track c.label) {
                <div>
                  <dt>{{ c.label }}</dt>
                  @for (p of c.phones; track p) {
                    <dd><a [href]="tel(p)">{{ p }}</a></dd>
                  }
                </div>
              }
            </dl>
          </section>

          <section class="card card--panel" aria-labelledby="i-title">
            <h2 id="i-title" class="t-h3">Inscriptions</h2>
            <p class="t-body-s">
              Bac nationale : les ouvertures d’inscription, la liste des pièces à fournir et le formulaire de demande sont
              publiés en arabe sur le site officiel du collège.
            </p>
            <a class="t-label" [href]="nationaleLink.url">Voir les annonces sur lasalle-eg.net</a>
            <p class="t-body-s">Bac français : les demandes se font en ligne, sur le site de la section.</p>
            <ul class="stack stack--sm" role="list">
              @for (l of bacForms; track l.url) {
                <li><a class="t-label" [href]="l.url">{{ l.label }}</a></li>
              }
            </ul>
          </section>

          <section class="card card--panel" aria-labelledby="l-title">
            <h2 id="l-title" class="t-h3">Sites du collège</h2>
            <ul class="stack stack--sm" role="list">
              @for (l of links; track l.url) {
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
  protected readonly school = SCHOOL;
  protected readonly contacts = CONTACTS;
  protected readonly links = SCHOOL_LINKS;
  protected readonly nationaleLink = NATIONALE.links[0];
  protected readonly bacForms = BAC.links.filter((l) => l.label.startsWith('Inscription'));
  protected readonly tel = telHref;
  protected readonly mapUrl =
    'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Collège De La Salle, El-Zaher, Cairo');
}
