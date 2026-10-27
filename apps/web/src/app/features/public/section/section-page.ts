import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../../i18n/locale';
import { pageUrl } from '../../../i18n/pages';
import { CONTACTS, localizedPhoto, MATIERE_GROUPS, matieresFor, SCHOOL, type SectionSlug } from '../../../school';
import { isMatiereId } from '../../../school/school-content';
import { Button, Icon } from '../../../shared/ui';
import { Breadcrumb } from '../shared/breadcrumb';
import { telHref } from '../../../school/contact-mail';
import { Facts } from '../shared/facts';
import { PhotoFigure } from '../shared/photo-figure';
import { TRACK_SUMMARY } from '../shared/track-summary';
import { type MatiereCardData, MatiereCard } from './matiere-card';

/**
 * `/bac-nationale` and `/bac-francais` (route data `section`), in the route's language: one template for the
 * college's two tracks, after design/prototypes/bac-francais.html. Intro, key figures, the track's text blocks,
 * headcounts (Bac français), practical information and the subject catalogue.
 */
@Component({
  selector: 'site-section-page',
  imports: [RouterLink, Button, Icon, Breadcrumb, Facts, PhotoFigure, MatiereCard],
  template: `
    @let s = page();
    <section class="section section--subtle page-intro" aria-labelledby="page-title">
      <div class="container grid-2 split">
        <div class="stack">
          <nav siteBreadcrumb [current]="s.title"></nav>
          <h1 id="page-title" class="t-display-l">{{ s.title }}</h1>
          <p class="t-accent t-label">{{ words().kicker }}</p>
          <p class="t-body-l">{{ s.intro }}</p>
          <div class="hero__actions">
            <a cdlsButton [routerLink]="links.contact">{{ t.common.prepareRegistration }}</a>
            <a class="t-label" [href]="s.links[0].url">{{ s.links[0].label }}</a>
          </div>
        </div>
        <figure sitePhoto class="page-intro__figure" [photo]="introPhoto()" [priority]="true"></figure>
      </div>
    </section>

    <section siteFacts [label]="t.section.atAGlance(s.title)" [facts]="s.facts"></section>

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
                <p class="t-quote">{{ t.common.motto }}</p>
              </blockquote>
            }
          }

          @if (s.counts.length) {
            <h2 id="effectifs" class="t-h1">{{ t.section.headcount }}</h2>
            <div class="table-wrap" role="region" tabindex="0" aria-labelledby="effectifs-caption">
              <table class="table">
                <caption id="effectifs-caption">{{ s.countsNote }}</caption>
                <thead>
                  <tr>
                    <th scope="col">{{ t.section.cycle }}</th>
                    <th scope="col">{{ t.section.level }}</th>
                    <th scope="col" class="num">{{ t.section.students }}</th>
                  </tr>
                </thead>
                @for (c of s.counts; track c.cycle) {
                  <tbody>
                    @for (l of c.levels; track l.level; let firstLevel = $first) {
                      <tr>
                        @if (firstLevel) {
                          <th scope="rowgroup" [attr.rowspan]="c.levels.length">{{ c.cycle }}</th>
                        }
                        <td lang="fr">{{ l.level }}</td>
                        <td class="num">{{ l.students }}</td>
                      </tr>
                    }
                  </tbody>
                }
                <tfoot>
                  <tr>
                    <th scope="row" colspan="2">{{ t.section.total }}</th>
                    <td class="num">{{ total() }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        </article>

        <aside class="stack" [attr.aria-label]="t.section.practical">
          <section class="card card--panel" aria-labelledby="p-contact">
            <h2 id="p-contact" class="t-h3">{{ t.section.office }}</h2>
            <ul class="contact-lines contact-lines--light" role="list">
              @for (c of phones(); track c.id) {
                <li>
                  <cdls-icon name="phone" /><span
                    >{{ content.contactLabels[c.id] }}{{ t.common.colon }}
                    <a class="phone-number" [href]="tel(c.phones[0])">{{ c.phones[0] }}</a></span
                  >
                </li>
              }
              <li><cdls-icon name="mail" /><a [href]="'mailto:' + school.email">{{ school.email }}</a></li>
              <li><cdls-icon name="map-pin" /><span>{{ content.school.address }}</span></li>
            </ul>
            <a cdlsButton variant="secondary" [block]="true" [routerLink]="links.contact">{{ t.section.writeToOffice }}</a>
          </section>

          <section class="card card--panel" aria-labelledby="p-dates">
            <h2 id="p-dates" class="t-h3">{{ t.section.landmarks }}</h2>
            <ol class="mini-timeline" role="list">
              @for (m of reperes(); track m.year) {
                <li><span class="mini-timeline__year">{{ m.year }}</span>{{ m.title }}</li>
              }
            </ol>
            <a class="t-label" [routerLink]="links.history">{{ t.section.collegeHistory }}</a>
          </section>

          <section class="card card--panel" aria-labelledby="p-liens">
            <h2 id="p-liens" class="t-h3">{{ t.section.usefulLinks }}</h2>
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
            <h2 id="matieres-title" class="t-h1">{{ t.section.subjectsTitle }}</h2>
            <p class="t-body-l t-muted">
              {{ t.section.subjectsLead.before }}<a [routerLink]="links.login">{{ t.section.subjectsLead.link }}</a
              >{{ t.section.subjectsLead.after }}
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
  `,
  styles: `
    .groups {
      display: grid;
      gap: var(--space-16);
    }
  `,
})
export class SectionPage {
  /** Bound from the route's `data: { section }` (public.routes.ts). */
  readonly section = input.required<SectionSlug>();

  readonly #locale = inject(LOCALE);
  protected readonly t = this.#locale.messages;
  protected readonly content = this.#locale.content;
  protected readonly school = SCHOOL;
  protected readonly tel = telHref;
  protected readonly links = {
    contact: pageUrl(this.#locale.lang, 'contact'),
    history: pageUrl(this.#locale.lang, 'history'),
    login: pageUrl(this.#locale.lang, 'login'),
  };
  protected readonly page = computed(() => this.content.sections[this.section()]);
  protected readonly summary = computed(() => TRACK_SUMMARY[this.section()]);
  protected readonly words = computed(() => this.content.tracks[this.section()]);
  protected readonly introPhoto = computed(() =>
    localizedPhoto(this.page().photo, this.content.photos, this.content.photoCredits),
  );
  protected readonly phones = computed(() => CONTACTS.filter((c) => this.summary().contacts.includes(c.id)));
  protected readonly reperes = computed(() => this.content.milestones.filter((m) => this.summary().years.includes(m.year)));
  protected readonly total = computed(() =>
    this.page()
      .counts.flatMap((c) => c.levels)
      .reduce((sum, l) => sum + l.students, 0),
  );

  /** The subject catalogue of this track, by group (empty groups are skipped), in the page's language. */
  protected readonly groups = computed(() => {
    const items: MatiereCardData[] = matieresFor(this.section()).flatMap((m) =>
      isMatiereId(m.id) ? [{ id: m.id, group: m.group, image: m.image, ...this.content.matieres[m.id] }] : [],
    );
    return MATIERE_GROUPS.map((group) => ({
      name: this.content.matiereGroups[group],
      items: items.filter((m) => m.group === group),
    })).filter((g) => g.items.length);
  });
}
