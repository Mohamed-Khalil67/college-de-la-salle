import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTACTS, MATIERE_GROUPS, matieresFor, MILESTONES, photo, SCHOOL, sectionBySlug } from '../../school';
import { Button, Icon } from '../../ui';
import { Breadcrumb } from '../shared/breadcrumb';
import { telHref } from '../shared/contact-mail';
import { Facts } from '../shared/facts';
import { PhotoFigure } from '../shared/photo-figure';
import { TRACK_SUMMARY } from '../shared/track-summary';
import { MatiereCard } from './matiere-card';

/**
 * `/bac-nationale` and `/bac-francais` (route data `section`): one template for the college's two
 * tracks, after design/prototypes/bac-francais.html. Intro, key figures, the track's text blocks,
 * headcounts (Bac français), practical information and the subject catalogue.
 */
@Component({
  selector: 'site-section-page',
  imports: [RouterLink, Button, Icon, Breadcrumb, Facts, PhotoFigure, MatiereCard],
  template: `
    @if (page(); as s) {
      <section class="section section--subtle page-intro" aria-labelledby="page-title">
        <div class="container grid-2 split">
          <div class="stack">
            <nav siteBreadcrumb [current]="s.title"></nav>
            <h1 id="page-title" class="t-display-l">{{ s.title }}</h1>
            <p class="t-accent t-label">{{ summary().kicker }}</p>
            <p class="t-body-l">{{ s.intro }}</p>
            <div class="hero__actions">
              <a cdlsButton routerLink="/contact">Préparer une inscription</a>
              <a class="t-label" [href]="s.links[0].url">{{ s.links[0].label }}</a>
            </div>
          </div>
          <figure sitePhoto class="page-intro__figure" [photo]="introPhoto()" [priority]="true"></figure>
        </div>
      </section>

      <section siteFacts [label]="s.title + ' en bref'" [facts]="s.facts"></section>

      <div class="section">
        <div class="container content-grid">
          <article class="prose" [attr.aria-labelledby]="s.blocks[0].id">
            @for (b of s.blocks; track b.id; let first = $first) {
              <h2 [id]="b.id" class="t-h1">{{ b.title }}</h2>
              @for (p of b.paragraphs; track $index) {
                <p>{{ p }}</p>
              }
              @if (b.items.length) {
                <ul class="bullets" role="list">
                  @for (item of b.items; track $index) {
                    <li>{{ item }}</li>
                  }
                </ul>
              }
              @if (first) {
                <blockquote class="pull-quote">
                  <p class="t-quote">« Signum Fidei », signe de la foi : la devise des Frères des Écoles chrétiennes.</p>
                </blockquote>
              }
            }

            @if (s.counts.length) {
              <h2 id="effectifs" class="t-h1">Effectifs</h2>
              <div class="table-wrap" role="region" tabindex="0" aria-labelledby="effectifs-caption">
                <table class="table">
                  <caption id="effectifs-caption">{{ s.countsNote }}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Cycle</th>
                      <th scope="col">Niveau</th>
                      <th scope="col" class="num">Élèves</th>
                    </tr>
                  </thead>
                  @for (c of s.counts; track c.cycle) {
                    <tbody>
                      @for (l of c.levels; track l.level; let firstLevel = $first) {
                        <tr>
                          @if (firstLevel) {
                            <th scope="rowgroup" [attr.rowspan]="c.levels.length">{{ c.cycle }}</th>
                          }
                          <td>{{ l.level }}</td>
                          <td class="num">{{ l.students }}</td>
                        </tr>
                      }
                    </tbody>
                  }
                  <tfoot>
                    <tr>
                      <th scope="row" colspan="2">Total</th>
                      <td class="num">{{ total() }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            }
          </article>

          <aside class="stack" aria-label="Informations pratiques">
            <section class="card card--panel" aria-labelledby="p-contact">
              <h2 id="p-contact" class="t-h3">Secrétariat</h2>
              <ul class="contact-lines contact-lines--light" role="list">
                @for (c of phones(); track c.label) {
                  <li>
                    <cdls-icon name="phone" /><span>{{ c.label }} : <a [href]="tel(c.phones[0])">{{ c.phones[0] }}</a></span>
                  </li>
                }
                <li><cdls-icon name="mail" /><a [href]="'mailto:' + school.email">{{ school.email }}</a></li>
                <li><cdls-icon name="map-pin" /><span>{{ school.address }}</span></li>
              </ul>
              <a cdlsButton variant="secondary" [block]="true" routerLink="/contact">Écrire au secrétariat</a>
            </section>

            <section class="card card--panel" aria-labelledby="p-dates">
              <h2 id="p-dates" class="t-h3">Repères</h2>
              <ol class="mini-timeline" role="list">
                @for (m of reperes(); track m.year) {
                  <li><span class="mini-timeline__year">{{ m.year }}</span>{{ m.title }}</li>
                }
              </ol>
              <a class="t-label" routerLink="/histoire">L’histoire du collège</a>
            </section>

            <section class="card card--panel" aria-labelledby="p-liens">
              <h2 id="p-liens" class="t-h3">Liens utiles</h2>
              <ul class="stack stack--sm" role="list">
                @for (l of s.links; track l.url) {
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

      <section class="section section--subtle" aria-labelledby="matieres-title">
        <div class="container">
          <div class="section__head">
            <div class="section__intro">
              <h2 id="matieres-title" class="t-h1">Les matières</h2>
              <p class="t-body-l t-muted">
                Les matières que les enseignants publient dans l’espace de leur classe : devoirs, ressources et notes. Les
                élèves retrouvent celles de leur classe en se connectant à l’<a routerLink="/connexion">espace élève</a>.
              </p>
            </div>
          </div>
          <div class="groups">
            @for (g of groups(); track g.name) {
              <div class="stack">
                <h3 class="t-h2">{{ g.name }}</h3>
                <ul class="grid-3" role="list">
                  @for (m of g.items; track m.id) {
                    <li siteMatiereCard [matiere]="m"></li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      </section>
    } @else {
      <section class="section page-intro--compact">
        <div class="container stack">
          <h1 class="t-display-l">Page introuvable</h1>
          <p><a routerLink="/">Retour à l’accueil</a></p>
        </div>
      </section>
    }
  `,
  styles: `
    .groups {
      display: grid;
      gap: var(--space-16);
    }
  `,
})
export class SectionPage {
  /** Bound from the route's `data: { section }`. */
  readonly section = input.required<string>();

  protected readonly school = SCHOOL;
  protected readonly tel = telHref;
  protected readonly page = computed(() => sectionBySlug(this.section()));
  protected readonly summary = computed(() => TRACK_SUMMARY[this.page()?.slug ?? 'nationale']);
  protected readonly introPhoto = computed(() => photo(this.page()?.photo ?? 'campus-aerien'));
  protected readonly phones = computed(() => CONTACTS.filter((c) => this.summary().contacts.includes(c.label)));
  protected readonly reperes = computed(() => MILESTONES.filter((m) => this.summary().years.includes(m.year)));
  protected readonly total = computed(() =>
    (this.page()?.counts ?? []).flatMap((c) => c.levels).reduce((sum, l) => sum + l.students, 0),
  );

  /** The subject catalogue of this track, by group (empty groups are skipped). */
  protected readonly groups = computed(() => {
    const items = matieresFor(this.page()?.slug ?? 'nationale');
    return MATIERE_GROUPS.map((name) => ({ name, items: items.filter((m) => m.group === name) })).filter(
      (g) => g.items.length,
    );
  });
}
