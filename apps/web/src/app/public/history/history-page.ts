import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DIRECTORS,
  FOUNDER,
  FRERES_EGYPTE,
  KEY_FIGURES,
  MILESTONES,
  PHOTOS,
  photo,
  SCHOOL_HISTORY_INTRO,
} from '../../school';
import { Breadcrumb } from '../shared/breadcrumb';
import { Facts } from '../shared/facts';
import { PhotoFigure } from '../shared/photo-figure';
import { Timeline } from '../shared/timeline';

/** `/histoire`: the college's history in the visual language of the home timeline. */
@Component({
  selector: 'site-history-page',
  imports: [RouterLink, Breadcrumb, Facts, PhotoFigure, Timeline],
  template: `
    <section class="section section--subtle page-intro" aria-labelledby="page-title">
      <div class="container grid-2 split">
        <div class="stack">
          <nav siteBreadcrumb current="Histoire"></nav>
          <h1 id="page-title" class="t-display-l">Histoire et patrimoine</h1>
          @for (p of intro; track $index) {
            <p class="t-body-l">{{ p }}</p>
          }
          <nav aria-labelledby="toc-title">
            <h2 id="toc-title" class="t-label t-muted">Sur cette page</h2>
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

    <section siteFacts label="Le collège en bref" [facts]="keyFigures"></section>

    <section id="etapes" class="section" aria-labelledby="etapes-title">
      <div class="container">
        <div class="section__head">
          <div class="section__intro">
            <h2 id="etapes-title" class="t-h1">Les grandes étapes</h2>
            <p class="t-body-l t-muted">
              Chaque date indique sa source : l’administration du collège, son site officiel ou les archives lasalliennes.
              Quand elles diffèrent, la page donne les deux.
            </p>
          </div>
        </div>
        <ol siteTimeline variant="full" [milestones]="milestones" sizes="(max-width: 56rem) 100vw, 40vw"></ol>
      </div>
    </section>

    <section id="fondateur" class="section section--subtle" aria-labelledby="fondateur-title">
      <div class="container grid-2 split">
        <div class="stack">
          <h2 id="fondateur-title" class="t-h1">{{ founder.name }}</h2>
          <p class="t-accent t-label">{{ founder.dates }}, fondateur des Frères des Écoles chrétiennes</p>
          @for (p of founder.summary; track $index) {
            <p class="t-body-l">{{ p }}</p>
          }
          <blockquote class="pull-quote">
            <p class="t-quote">« Signum Fidei », signe de la foi : la devise des Frères des Écoles chrétiennes.</p>
          </blockquote>
        </div>
        <section class="card card--panel" aria-labelledby="dates-title">
          <h3 id="dates-title" class="t-h3">Dates clés</h3>
          <ul class="levels" role="list">
            @for (f of founder.facts; track f.date) {
              <li><span class="t-label">{{ f.date }}</span><span class="t-muted">{{ f.text }}</span></li>
            }
          </ul>
        </section>
      </div>
    </section>

    @for (b of freres; track b.id) {
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
            <h2 id="directeurs-title" class="t-h1">Ceux qui ont dirigé le collège</h2>
            <p class="t-body-l t-muted">Liste publiée sur le site officiel du collège, depuis l’inauguration de 1905.</p>
          </div>
        </div>
        <div class="grid-2">
          @for (group of directorGroups; track group.id) {
            <div class="table-wrap" role="region" tabindex="0" [attr.aria-labelledby]="'caption-' + group.id">
              <table class="table">
                <caption [id]="'caption-' + group.id">{{ group.title }}</caption>
                <thead>
                  <tr>
                    <th scope="col">Nom</th>
                    <th scope="col">Période</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of group.items; track d.name + d.period) {
                    <tr>
                      <th scope="row">
                        {{ d.name }}
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
            <h2 id="archives-title" class="t-h1">Archives photographiques</h2>
            <p class="t-body-l t-muted">
              Photographies des archives des Frères des Écoles chrétiennes, Proche-Orient
              (<a href="https://lasalle-po.org/">lasalle-po.org</a>), et de l’album d’archives du collège
              (<a [href]="albumUrl">lasalle-eg.net</a>).
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
  protected readonly intro = SCHOOL_HISTORY_INTRO;
  protected readonly keyFigures = KEY_FIGURES;
  protected readonly milestones = MILESTONES;
  protected readonly founder = FOUNDER;
  protected readonly freres = FRERES_EGYPTE;
  protected readonly gallery = Object.values(PHOTOS);
  protected readonly introPhoto = photo('campus-1907');
  protected readonly albumUrl = PHOTOS['campus-1907'].sourceUrl;
  protected readonly anchors = [
    { id: 'etapes', label: 'Les grandes étapes' },
    { id: 'fondateur', label: 'Le fondateur' },
    { id: 'freres', label: 'Les Frères en Égypte' },
    { id: 'directeurs', label: 'Les directeurs' },
    { id: 'archives', label: 'Les archives' },
  ];
  protected readonly directorGroups = [
    { id: 'freres', title: 'Frères directeurs et coordinateurs', items: DIRECTORS.filter((d) => d.kind === 'frere') },
    { id: 'laics', title: 'Directeurs laïcs', items: DIRECTORS.filter((d) => d.kind === 'laic') },
  ];
}
