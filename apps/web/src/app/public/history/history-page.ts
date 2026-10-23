import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../i18n/locale';
import { DIRECTORS, localizedPhoto, PHOTOS, type PhotoId } from '../../school';
import { directorPeriod } from '../../school/school-content';
import { Breadcrumb } from '../shared/breadcrumb';
import { Facts } from '../shared/facts';
import { PhotoFigure } from '../shared/photo-figure';
import { Timeline } from '../shared/timeline';

const ANCHORS = ['etapes', 'fondateur', 'freres', 'directeurs', 'archives'] as const;

/** `/histoire`: the college's history in the visual language of the home timeline. */
@Component({
  selector: 'site-history-page',
  imports: [RouterLink, Breadcrumb, Facts, PhotoFigure, Timeline],
  template: `
    <section class="section section--subtle page-intro" aria-labelledby="page-title">
      <div class="container grid-2 split">
        <div class="stack">
          <nav siteBreadcrumb [current]="h.title"></nav>
          <h1 id="page-title" class="t-display-l">{{ h.title }}</h1>
          @for (p of content.historyIntro; track $index) {
            <p class="t-body-l">{{ p }}</p>
          }
          <nav aria-labelledby="toc-title">
            <h2 id="toc-title" class="t-label t-muted">{{ h.onThisPage }}</h2>
            <ul class="toc" role="list">
              @for (a of anchors; track a.id) {
                <li><a class="t-label" [routerLink]="[]" [fragment]="a.id">{{ a.label }}</a></li>
              }
            </ul>
          </nav>
        </div>
        <figure sitePhoto class="page-intro__figure" [photo]="introPhoto" [priority]="true"></figure>
      </div>
    </section>

    <section siteFacts [label]="h.atAGlance" [facts]="content.keyFigures"></section>

    <section id="etapes" class="section" aria-labelledby="etapes-title">
      <div class="container">
        <div class="section__head">
          <div class="section__intro">
            <h2 id="etapes-title" class="t-h1">{{ h.stepsTitle }}</h2>
            <p class="t-body-l t-muted">{{ h.stepsLead }}</p>
          </div>
        </div>
        <ol siteTimeline variant="full" [milestones]="content.milestones" sizes="(max-width: 56rem) 100vw, 40vw"></ol>
      </div>
    </section>

    <section id="fondateur" class="section section--subtle" aria-labelledby="fondateur-title">
      <div class="container grid-2 split">
        <div class="stack">
          <h2 id="fondateur-title" class="t-h1">{{ founder.name }}</h2>
          <p class="t-accent t-label">{{ founder.dates }}, {{ founder.role }}</p>
          @for (p of founder.summary; track $index) {
            <p class="t-body-l">{{ p }}</p>
          }
          <blockquote class="pull-quote">
            <p class="t-quote">{{ motto }}</p>
          </blockquote>
        </div>
        <section class="card card--panel" aria-labelledby="dates-title">
          <h3 id="dates-title" class="t-h3">{{ h.keyDates }}</h3>
          <ul class="levels" role="list">
            @for (f of founder.facts; track f.date) {
              <li><span class="t-label">{{ f.date }}</span><span class="t-muted">{{ f.text }}</span></li>
            }
          </ul>
        </section>
      </div>
    </section>

    @for (b of content.freres; track b.id) {
      <section id="freres" class="section" aria-labelledby="freres-title">
        <div class="container">
          <div class="prose">
            <h2 id="freres-title" class="t-h1">{{ b.title }}</h2>
            @for (p of b.paragraphs; track $index) {
              <p>{{ p }}</p>
            }
            <ul class="bullets" role="list">
              @for (item of b.items; track $index) {
                <li>{{ item }}</li>
              }
            </ul>
          </div>
        </div>
      </section>
    }

    <section id="directeurs" class="section section--subtle" aria-labelledby="directeurs-title">
      <div class="container">
        <div class="section__head">
          <div class="section__intro">
            <h2 id="directeurs-title" class="t-h1">{{ h.directorsTitle }}</h2>
            <p class="t-body-l t-muted">{{ h.directorsLead }}</p>
          </div>
        </div>
        <div class="grid-2">
          @for (group of directorGroups; track group.id) {
            <div class="table-wrap" role="region" tabindex="0" [attr.aria-labelledby]="'caption-' + group.id">
              <table class="table">
                <caption [id]="'caption-' + group.id">{{ group.title }}</caption>
                <thead>
                  <tr>
                    <th scope="col">{{ h.name }}</th>
                    <th scope="col">{{ h.period }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of group.items; track d.name + d.period) {
                    <tr>
                      <th scope="row">
                        <span lang="fr">{{ d.name }}</span>
                        @if (d.role) {
                          <span class="d-block t-caption t-muted">{{ d.role }}</span>
                        }
                      </th>
                      <td>{{ d.period }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
    </section>

    <section id="archives" class="section" aria-labelledby="archives-title">
      <div class="container">
        <div class="section__head">
          <div class="section__intro">
            <h2 id="archives-title" class="t-h1">{{ h.archivesTitle }}</h2>
            <p class="t-body-l t-muted">
              {{ h.archivesLead.before }}<a href="https://lasalle-po.org/">lasalle-po.org</a>{{ h.archivesLead.middle }}<a
                [href]="albumUrl"
                >lasalle-eg.net</a
              >{{ h.archivesLead.after }}
            </p>
          </div>
        </div>
        <ul class="grid-3" role="list">
          @for (p of gallery; track p.id) {
            <li><figure sitePhoto [photo]="p" aspect="4 / 3" sizes="(max-width: 64rem) 100vw, 33vw"></figure></li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: `
    .toc {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-6);
      margin-top: var(--space-2);
    }
    .toc a {
      display: inline-block;
      padding-block: var(--space-3);
    }
  `,
})
export class HistoryPage {
  readonly #locale = inject(LOCALE);
  protected readonly h = this.#locale.messages.history;
  protected readonly motto = this.#locale.messages.common.motto;
  protected readonly content = this.#locale.content;
  protected readonly founder = this.content.founder;
  readonly #photo = (id: PhotoId) => localizedPhoto(id, this.content.photos, this.content.photoCredits);
  protected readonly gallery = (Object.keys(PHOTOS) as PhotoId[]).map(this.#photo);
  protected readonly introPhoto = this.#photo('campus-1907');
  protected readonly albumUrl = PHOTOS['campus-1907'].sourceUrl;
  protected readonly anchors = ANCHORS.map((id) => ({ id, label: this.h.anchors[id] }));
  protected readonly directorGroups = (['frere', 'laic'] as const).map((kind) => ({
    id: kind === 'frere' ? 'freres' : 'laics',
    title: kind === 'frere' ? this.h.brothersTable : this.h.layTable,
    items: DIRECTORS.filter((d) => d.kind === kind).map((d) => ({
      name: d.name,
      period: directorPeriod(d, this.content.directors),
      role: d.role ? this.content.directors.roles[d.role] : null,
    })),
  }));
}
