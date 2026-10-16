import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTACTS, SCHOOL, SCHOOL_LINKS } from '@site/content';

/** `/contact` — address, e-mail and telephone numbers by department. */
@Component({
  selector: 'site-contact-page',
  imports: [RouterLink],
  template: `
    <header class="bg-navy-900 text-cream">
      <div class="on-dark mx-auto grid max-w-6xl gap-3 px-4 py-14">
        <p class="kicker">Collège de la Salle · Daher</p>
        <h1 class="m-0 text-4xl text-white md:text-5xl">Contact</h1>
        <p class="m-0 max-w-3xl text-lg text-cream/90">
          Une question sur l’inscription, la scolarité ou la vie du collège ? Appelez le secrétariat ou le cycle concerné.
        </p>
      </div>
    </header>

    <div class="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="phones-title" class="grid gap-4">
        <h2 id="phones-title" class="m-0 text-3xl">Téléphone</h2>
        <div class="overflow-x-auto rounded-xl border border-line bg-surface">
          <table class="w-full border-collapse text-start" data-testid="phones">
            <thead>
              <tr class="border-b border-line text-sm text-muted">
                <th scope="col" class="p-3 text-start font-semibold">Service</th>
                <th scope="col" class="p-3 text-start font-semibold">Numéro</th>
              </tr>
            </thead>
            <tbody>
              @for (c of contacts; track c.label) {
                <tr class="border-b border-line last:border-0">
                  <th scope="row" class="p-3 text-start font-medium">{{ c.label }}</th>
                  <td class="p-3">
                    @for (p of c.phones; track p) {
                      <a class="me-3 inline-block whitespace-nowrap" [href]="'tel:' + tel(p)" dir="ltr">{{ p }}</a>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <aside class="grid content-start gap-6">
        <section aria-labelledby="address-title" class="grid gap-2 rounded-2xl border border-line border-s-4 border-s-gold bg-surface p-6">
          <h2 id="address-title" class="m-0 text-xl">Adresse</h2>
          <address class="m-0 not-italic">{{ school.name }}<br />{{ school.address }}</address>
          <a [href]="mapUrl" target="_blank" rel="noopener noreferrer">Voir sur la carte<span class="visually-hidden"> (nouvel onglet)</span></a>
        </section>
        <section aria-labelledby="mail-title" class="grid gap-2 rounded-2xl border border-line border-s-4 border-s-gold bg-surface p-6">
          <h2 id="mail-title" class="m-0 text-xl">E-mail</h2>
          <a [href]="'mailto:' + school.email" dir="ltr" class="break-all">{{ school.email }}</a>
        </section>
        <section aria-labelledby="links-title" class="grid gap-2 rounded-2xl border border-line border-s-4 border-s-gold bg-surface p-6">
          <h2 id="links-title" class="m-0 text-xl">Sites du collège</h2>
          <ul class="m-0 grid list-none gap-2 p-0">
            @for (l of links; track l.url) {
              <li><a [href]="l.url" target="_blank" rel="noopener noreferrer">{{ l.label }}</a></li>
            }
          </ul>
        </section>
        <a class="btn btn-gold justify-self-start" routerLink="/espace-eleve">Espace élève</a>
      </aside>
    </div>
  `,
})
export class ContactPage {
  protected readonly school = SCHOOL;
  protected readonly contacts = CONTACTS;
  protected readonly links = SCHOOL_LINKS;
  protected readonly mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Collège De La Salle, El-Zaher, Cairo');

  protected tel(phone: string): string {
    return phone.replace(/[^\d+]/g, '');
  }
}
