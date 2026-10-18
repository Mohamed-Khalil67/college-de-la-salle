import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTACTS, MATIERE_GROUPS, matieresFor, photo, SCHOOL, sectionBySlug } from '../../school';
import { MatiereCard } from './matiere-card';
import { SitePhoto } from '../site-photo';

/**
 * `/bac-nationale` and `/bac-francais`: one layout for the college's two tracks. Facts, blocks,
 * headcounts (Bac français), the subject catalogue and useful links.
 */
@Component({
  selector: 'site-section-page',
  imports: [RouterLink, SitePhoto, MatiereCard],
  template: `
    @if (page(); as s) {
      <header class="bg-navy-900 text-cream">
        <div class="on-dark mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[3fr_2fr]">
          <div class="grid gap-4">
            <p class="kicker">{{ s.kicker }}</p>
            <h1 class="m-0 text-4xl text-white md:text-5xl" data-testid="section-title">{{ s.title }}</h1>
            <p class="m-0 text-lg text-cream/90">{{ s.intro }}</p>
            <ul class="m-0 flex list-none flex-wrap gap-3 p-0">
              @for (f of s.facts; track f.label) {
                <li class="rounded-xl border border-gold/50 px-4 py-2">
                  <span class="block text-2xl font-bold text-gold">{{ f.value }}</span>
                  <span class="text-sm text-cream/85">{{ f.label }}</span>
                </li>
              }
            </ul>
          </div>
          <site-photo [photo]="heroPhoto()" aspect="4 / 3" [priority]="true" class="[&_figcaption]:text-cream/75" />
        </div>
      </header>

      <div class="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav class="lg:sticky lg:top-24 lg:self-start" aria-label="Sur cette page" data-testid="toc">
          <p class="kicker mb-3">Sur cette page</p>
          <ol class="m-0 grid list-none gap-1 p-0 text-sm">
            @for (b of s.blocks; track b.id) {
              <li><a class="block rounded-md px-3 py-1.5 no-underline hover:bg-navy-100" [routerLink]="[]" [fragment]="b.id">{{ b.title }}</a></li>
            }
            <li><a class="block rounded-md px-3 py-1.5 no-underline hover:bg-navy-100" [routerLink]="[]" fragment="matieres">Les matières</a></li>
            @if (s.counts.length) {
              <li><a class="block rounded-md px-3 py-1.5 no-underline hover:bg-navy-100" [routerLink]="[]" fragment="effectifs">Effectifs</a></li>
            }
            <li><a class="block rounded-md px-3 py-1.5 no-underline hover:bg-navy-100" [routerLink]="[]" fragment="liens">Liens utiles</a></li>
          </ol>
        </nav>

        <div class="grid min-w-0 gap-12">
          @for (b of s.blocks; track b.id) {
            <section [id]="b.id" [attr.aria-labelledby]="b.id + '-title'" class="grid gap-3" data-testid="block">
              <h2 [id]="b.id + '-title'" class="m-0 text-3xl">{{ b.title }}</h2>
              @for (p of b.paragraphs; track $index) {
                <p class="m-0 text-lg">{{ p }}</p>
              }
              @if (b.items.length) {
                <ul class="m-0 grid gap-2 ps-5">
                  @for (i of b.items; track $index) {
                    <li>{{ i }}</li>
                  }
                </ul>
              }
            </section>
          }

          <section id="matieres" aria-labelledby="matieres-title" class="grid gap-6">
            <div class="grid gap-2">
              <h2 id="matieres-title" class="m-0 text-3xl">Les matières</h2>
              <p class="m-0 text-muted">
                Les matières que les enseignants peuvent publier dans l’espace de leur classe : devoirs, ressources et notes.
                Connectez-vous à l’<a routerLink="/espace-eleve">Espace élève</a> pour voir celles de votre classe.
              </p>
            </div>
            @for (g of groups(); track g.name) {
              <div class="grid gap-3" [attr.data-testid]="'group-' + g.name">
                <h3 class="m-0 text-lg text-gold-ink">{{ g.name }}</h3>
                <ul class="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3" data-testid="matieres">
                  @for (m of g.items; track m.id) {
                    <li><site-matiere-card [matiere]="m" /></li>
                  }
                </ul>
              </div>
            }
          </section>

          @if (s.counts.length) {
            <section id="effectifs" aria-labelledby="effectifs-title" class="grid gap-3">
              <h2 id="effectifs-title" class="m-0 text-3xl">Effectifs</h2>
              <div class="overflow-x-auto rounded-xl border border-line bg-surface">
                <table class="w-full border-collapse text-start" data-testid="counts">
                  <caption class="p-3 text-start text-sm text-muted">{{ s.countsNote }}</caption>
                  <thead>
                    <tr class="border-b border-line text-sm text-muted">
                      <th scope="col" class="p-3 text-start font-semibold">Cycle</th>
                      <th scope="col" class="p-3 text-start font-semibold">Niveau</th>
                      <th scope="col" class="p-3 text-end font-semibold">Élèves</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of s.counts; track c.cycle) {
                      @for (l of c.levels; track l.level; let first = $first) {
                        <tr class="border-b border-line">
                          <th scope="row" class="p-3 text-start font-semibold">{{ first ? c.cycle : '' }}</th>
                          <td class="p-3">{{ l.level }}</td>
                          <td class="p-3 text-end tabular-nums">{{ l.students }}</td>
                        </tr>
                      }
                    }
                  </tbody>
                  <tfoot>
                    <tr class="bg-navy-100 font-bold">
                      <th scope="row" colspan="2" class="p-3 text-start">Total</th>
                      <td class="p-3 text-end tabular-nums" data-testid="counts-total">{{ total() }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          }

          <section id="liens" aria-labelledby="liens-title" class="grid gap-3">
            <h2 id="liens-title" class="m-0 text-3xl">Liens utiles</h2>
            <ul class="m-0 grid list-none gap-3 p-0">
              @for (l of s.links; track l.url) {
                <li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                  <div>
                    <p class="m-0 font-semibold">{{ l.label }}</p>
                    <p class="m-0 text-sm text-muted">{{ l.note }}</p>
                  </div>
                  <a class="btn btn-gold" [href]="l.url" target="_blank" rel="noopener noreferrer">Ouvrir<span class="visually-hidden"> (nouvel onglet)</span></a>
                </li>
              }
            </ul>
          </section>

          <aside class="grid gap-2 rounded-2xl bg-navy-900 p-6 text-cream" aria-label="Contact et espaces en ligne">
            <h2 class="m-0 text-2xl text-white">Une question ? Un élève ou un enseignant ?</h2>
            <p class="m-0">
              Secrétariat : <bdi dir="ltr">{{ phone() }}</bdi> · {{ school.address }}
            </p>
            <div class="mt-2 flex flex-wrap gap-3">
              <a class="btn btn-gold" routerLink="/contact">Nous contacter</a>
              <a class="btn btn-outline-light" routerLink="/espace-eleve">Espace élève</a>
              <a class="btn btn-outline-light" routerLink="/espace-enseignant">Espace enseignant</a>
            </div>
          </aside>
        </div>
      </div>
    } @else {
      <section class="mx-auto max-w-3xl px-4 py-20">
        <h1>Page introuvable</h1>
        <p><a routerLink="/">Retour à l’accueil</a></p>
      </section>
    }
  `,
})
export class SectionPage {
  /** Bound from the route's `data: { section }`. */
  readonly section = input.required<string>();

  protected readonly school = SCHOOL;
  protected readonly page = computed(() => sectionBySlug(this.section()));
  protected readonly heroPhoto = computed(() => photo(this.page()?.photo ?? 'campus-aerien'));
  protected readonly total = computed(() => (this.page()?.counts ?? []).flatMap((c) => c.levels).reduce((sum, l) => sum + l.students, 0));
  protected readonly phone = computed(() =>
    (this.section() === 'bac' ? CONTACTS.find((c) => c.label === 'Bac français') : CONTACTS[0])?.phones[0] ?? '',
  );

  /** The catalogue for this track, by group (empty groups are skipped). */
  protected readonly groups = computed(() => {
    const track = this.section() === 'bac' ? 'bac' : 'nationale';
    const items = matieresFor(track);
    return MATIERE_GROUPS.map((name) => ({ name, items: items.filter((m) => m.group === name) })).filter((g) => g.items.length);
  });
}
