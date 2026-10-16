import { Component } from '@angular/core';
import { MILESTONES, PHOTOS, photo, SCHOOL_HISTORY_INTRO } from '@site/content';
import { SitePhoto } from './ui/site-photo';

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
      </div>
    </header>

    <section class="mx-auto max-w-5xl px-4 py-14" aria-labelledby="timeline-title">
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

    <section class="border-t border-line bg-surface" aria-labelledby="gallery-title">
      <div class="mx-auto grid max-w-6xl gap-6 px-4 py-14">
        <h2 id="gallery-title" class="m-0 text-3xl">Archives photographiques</h2>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          @for (p of gallery; track p.id) {
            <site-photo [photo]="p" aspect="4 / 3" sizes="(max-width: 640px) 100vw, 33vw" />
          }
        </div>
        <p class="m-0 text-sm text-muted">
          Photographies : archives des Frères des Écoles Chrétiennes – Proche-Orient,
          <a href="https://lasalle-po.org/" target="_blank" rel="noopener noreferrer">lasalle-po.org</a>.
        </p>
      </div>
    </section>
  `,
})
export class HistoryPage {
  protected readonly intro = SCHOOL_HISTORY_INTRO;
  protected readonly milestones = MILESTONES;
  protected readonly gallery = Object.values(PHOTOS);
  protected readonly photoOf = photo;
}
