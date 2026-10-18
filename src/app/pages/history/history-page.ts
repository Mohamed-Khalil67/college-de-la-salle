import { Component } from '@angular/core';
import { DIRECTORS, FOUNDER, FRERES_EGYPTE, MILESTONES, PHOTOS, photo, SCHOOL_HISTORY_INTRO } from '../../school';
import { SitePhoto } from '../site-photo';

/** `/histoire` — Histoire & Patrimoine. */
@Component({
  selector: 'site-history-page',
  imports: [SitePhoto],
  template: `
    <header class="bg-navy-900 text-cream">
      <div class="on-dark mx-auto grid max-w-6xl gap-3 px-4 py-14">
        <p class="kicker">Collège de la Salle · Daher</p>
        <h1 class="m-0 text-4xl text-white md:text-5xl">Histoire &amp; Patrimoine</h1>
        @for (p of intro; track $index) {
          <p class="m-0 max-w-3xl text-lg text-cream/90">{{ p }}</p>
        }
        <nav aria-label="Sur cette page" class="mt-2 flex flex-wrap gap-2 text-sm">
          @for (a of anchors; track a.id) {
            <a class="rounded-full border border-gold/60 px-3 py-1 text-gold no-underline hover:bg-white/10" [href]="'#' + a.id">{{ a.label }}</a>
          }
        </nav>
      </div>
    </header>

    <section id="etapes" class="mx-auto max-w-5xl px-4 py-14" aria-labelledby="timeline-title">
      <h2 id="timeline-title" class="mb-10 text-3xl">Les grandes étapes</h2>
      <ol class="relative m-0 grid list-none gap-12 border-s-2 border-gold p-0 ps-8" data-testid="timeline">
        @for (m of milestones; track m.year) {
          <li class="relative">
            <span class="absolute -start-[2.6rem] top-1 size-4 rounded-full border-4 border-page bg-gold" aria-hidden="true"></span>
            <article [class]="m.photo ? 'grid items-start gap-6 md:grid-cols-2' : 'grid items-start gap-6'">
              <div class="grid gap-2">
                <p class="m-0 text-4xl font-bold text-gold-ink">{{ m.year }}</p>
                <h3 class="m-0 text-xl">{{ m.title }}</h3>
                <p class="m-0 text-muted">{{ m.text }}</p>
                <p class="m-0 text-xs text-muted">Source : {{ m.source }}</p>
              </div>
              @if (m.photo; as id) {
                <!-- Natural proportions: the 1926 group photo is a wide panorama and must not be cropped. -->
                <site-photo [photo]="photoOf(id)" />
              }
            </article>
          </li>
        }
      </ol>
    </section>

    <section id="fondateur" class="border-t border-line bg-surface" aria-labelledby="founder-title">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[3fr_2fr]">
        <div class="grid content-start gap-3">
          <p class="kicker">Le fondateur</p>
          <h2 id="founder-title" class="m-0 text-3xl">{{ founder.name }} <span class="text-gold-ink">({{ founder.dates }})</span></h2>
          @for (p of founder.summary; track $index) {
            <p class="m-0 text-lg">{{ p }}</p>
          }
        </div>
        <dl class="m-0 grid gap-3 rounded-2xl border border-line border-s-4 border-s-gold p-5" data-testid="founder-dates">
          @for (f of founder.facts; track f.date) {
            <div>
              <dt class="text-sm font-semibold text-gold-ink">{{ f.date }}</dt>
              <dd class="m-0">{{ f.text }}</dd>
            </div>
          }
        </dl>
      </div>
    </section>

    <section id="freres" class="mx-auto grid max-w-4xl gap-4 px-4 py-14" aria-labelledby="freres-title">
      <p class="kicker">En Égypte</p>
      @for (b of freres; track b.id) {
        <h2 id="freres-title" class="m-0 text-3xl">{{ b.title }}</h2>
        @for (p of b.paragraphs; track $index) {
          <p class="m-0 text-lg">{{ p }}</p>
        }
        <ul class="m-0 grid gap-2 ps-5">
          @for (i of b.items; track $index) {
            <li>{{ i }}</li>
          }
        </ul>
      }
    </section>

    <section id="directeurs" class="border-t border-line bg-surface" aria-labelledby="directors-title">
      <div class="mx-auto grid max-w-6xl gap-6 px-4 py-14">
        <div class="grid gap-2">
          <p class="kicker">Ceux qui ont dirigé le collège</p>
          <h2 id="directors-title" class="m-0 text-3xl">Frères directeurs et directeurs laïcs</h2>
          <p class="m-0 text-muted">Liste publiée sur le site officiel du collège, depuis l’inauguration de 1905.</p>
        </div>
        <div class="grid gap-8 md:grid-cols-2">
          @for (group of directorGroups; track group.title) {
            <div class="overflow-x-auto rounded-xl border border-line">
              <table class="w-full border-collapse text-start" [attr.data-testid]="'directors-' + group.id">
                <caption class="p-3 text-start font-semibold">{{ group.title }}</caption>
                <thead>
                  <tr class="border-y border-line text-sm text-muted">
                    <th scope="col" class="p-3 text-start font-semibold">Nom</th>
                    <th scope="col" class="p-3 text-start font-semibold">Période</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of group.items; track d.name + d.period) {
                    <tr class="border-b border-line last:border-0">
                      <th scope="row" class="p-3 text-start font-medium">{{ d.name }}@if (d.role) { <span class="block text-xs font-normal text-muted">{{ d.role }}</span> }</th>
                      <td class="p-3 whitespace-nowrap">{{ d.period }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
    </section>

    <section id="archives" class="mx-auto grid max-w-6xl gap-6 px-4 py-14" aria-labelledby="gallery-title">
      <h2 id="gallery-title" class="m-0 text-3xl">Archives photographiques</h2>
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="gallery">
        @for (p of gallery; track p.id) {
          <site-photo [photo]="p" aspect="4 / 3" sizes="(max-width: 640px) 100vw, 33vw" />
        }
      </div>
      <p class="m-0 text-sm text-muted">
        Photographies : archives des Frères des Écoles Chrétiennes – Proche-Orient
        (<a href="https://lasalle-po.org/" target="_blank" rel="noopener noreferrer">lasalle-po.org</a>) et album d’archives du collège
        (<a href="http://www.lasalle-eg.net/college/album.htm" target="_blank" rel="noopener noreferrer">lasalle-eg.net</a>).
      </p>
    </section>
  `,
})
export class HistoryPage {
  protected readonly intro = SCHOOL_HISTORY_INTRO;
  protected readonly milestones = MILESTONES;
  protected readonly founder = FOUNDER;
  protected readonly freres = FRERES_EGYPTE;
  protected readonly gallery = Object.values(PHOTOS);
  protected readonly photoOf = photo;
  protected readonly anchors = [
    { id: 'etapes', label: 'Grandes étapes' },
    { id: 'fondateur', label: 'Le fondateur' },
    { id: 'freres', label: 'Les Frères en Égypte' },
    { id: 'directeurs', label: 'Directeurs' },
    { id: 'archives', label: 'Archives' },
  ];
  protected readonly directorGroups = [
    { id: 'freres', title: 'Frères directeurs et coordinateurs', items: DIRECTORS.filter((d) => d.kind === 'frere') },
    { id: 'laics', title: 'Directeurs laïcs', items: DIRECTORS.filter((d) => d.kind === 'laic') },
  ];
}
