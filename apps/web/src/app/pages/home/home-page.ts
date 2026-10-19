import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MILESTONES, photo, SCHOOL, SECTIONS } from '../../school';
import { SitePhoto } from '../site-photo';

/** `/` — Accueil. */
@Component({
  selector: 'site-home-page',
  imports: [NgOptimizedImage, RouterLink, SitePhoto],
  template: `
    <!-- Hero: the campus from the air, under a navy veil so the text keeps AA contrast -->
    <section class="relative isolate overflow-hidden bg-navy-900 text-cream" aria-labelledby="hero-title">
      <img fill priority [ngSrc]="hero.src" alt="" sizes="100vw" class="-z-10 object-cover opacity-60" />
      <div class="absolute inset-0 -z-10 bg-linear-to-r from-navy-900 via-navy-900/80 to-navy-900/20" aria-hidden="true"></div>
      <div class="on-dark mx-auto grid max-w-6xl gap-5 px-4 py-20 md:py-28">
        <p class="kicker">{{ school.section }}</p>
        <h1 id="hero-title" class="m-0 max-w-3xl text-4xl font-bold leading-tight text-white md:text-6xl">
          {{ school.name }} <span class="text-gold">— {{ school.district }}</span>
        </h1>
        <p class="m-0 max-w-2xl text-lg text-cream/90 md:text-xl">
          {{ school.tagline }} Deux parcours, un même projet lasallien : le Bac nationale et le Bac français.
        </p>
      </div>
      <p class="absolute bottom-2 end-3 m-0 text-xs text-cream/70">{{ hero.credit }}</p>
    </section>

    <!-- The two sections -->
    <section id="sections" class="mx-auto grid max-w-6xl gap-8 px-4 py-16" aria-labelledby="sections-title">
      <div class="grid gap-2">
        <p class="kicker">Nos deux sections</p>
        <h2 id="sections-title" class="m-0 text-3xl">Un collège, deux parcours</h2>
      </div>
      <ul class="m-0 grid list-none gap-6 p-0 md:grid-cols-2">
        @for (s of sections; track s.slug) {
          <li>
            <a
              [routerLink]="s.slug === 'bac' ? '/bac-francais' : '/bac-nationale'"
              class="group grid h-full overflow-hidden rounded-2xl border border-line bg-surface no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              [attr.data-testid]="'section-card-' + s.slug"
            >
              <site-photo [photo]="photoOf(s.photo)" aspect="16 / 9" [caption]="false" rounded="rounded-none" sizes="(max-width: 768px) 100vw, 50vw" />
              <div class="grid gap-2 p-6">
                <span class="text-2xl font-bold text-navy-900">{{ s.title }}</span>
                <span class="text-sm text-gold-ink">{{ s.kicker }}</span>
                <span class="line-clamp-3 text-muted">{{ s.intro }}</span>
              </div>
              <span class="px-6 pb-6 font-semibold text-navy-700 group-hover:underline">Découvrir la section →</span>
            </a>
          </li>
        }
      </ul>
    </section>

    <!-- The school spaces -->
    <section class="border-y border-line bg-navy-100" aria-labelledby="space-title">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 py-14">
        <div class="grid gap-2">
          <p class="kicker">Espaces en ligne</p>
          <h2 id="space-title" class="m-0 text-3xl">Les enseignants publient, les élèves retrouvent tout</h2>
          <p class="m-0 max-w-3xl text-lg">
            Annonces, devoirs avec date de rendu, ressources de cours et notes avec les commentaires de l’enseignant :
            chaque élève du Bac nationale et du Bac français voit ce qui concerne sa classe, depuis n’importe quel appareil.
          </p>
        </div>
        <ul class="m-0 grid list-none gap-6 p-0 md:grid-cols-2">
          <li class="grid content-start gap-3 rounded-2xl border border-line bg-surface p-6">
            <h3 class="m-0 text-2xl">Espace élève</h3>
            <p class="m-0 text-muted">Annonces, devoirs à faire, ressources et notes de votre classe, avec votre moyenne par matière.</p>
            <div><a class="btn btn-navy-solid" routerLink="/espace-eleve" data-testid="home-student">Accéder à l’Espace élève</a></div>
          </li>
          <li class="grid content-start gap-3 rounded-2xl border border-line bg-surface p-6">
            <h3 class="m-0 text-2xl">Espace enseignant</h3>
            <p class="m-0 text-muted">Publiez pour une classe ou une section, fixez une date de rendu et saisissez les notes de vos élèves.</p>
            <div><a class="btn btn-navy-solid" routerLink="/espace-enseignant" data-testid="home-teacher">Accéder à l’Espace enseignant</a></div>
          </li>
        </ul>
      </div>
    </section>

    <!-- Heritage teaser -->
    <section class="bg-navy-900 text-cream" aria-labelledby="heritage-title">
      <div class="on-dark mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2">
        <site-photo [photo]="inauguration" aspect="4 / 3" class="[&_figcaption]:text-cream/80" />
        <div class="grid gap-4">
          <p class="kicker">Histoire &amp; Patrimoine</p>
          <h2 id="heritage-title" class="m-0 text-3xl text-white">Plus d’un siècle à Daher</h2>
          <p class="m-0 text-cream/90">
            Du bâtiment en briques rouges à l’inauguration des nouveaux bâtiments en 1955 et de la chapelle en 1958 :
            les grandes étapes du collège, illustrées par les archives des Frères.
          </p>
          <ol class="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Dates clés">
            @for (m of milestones; track m.year) {
              <li class="rounded-full border border-gold/60 px-3 py-1 text-sm font-semibold text-gold">{{ m.year }}</li>
            }
          </ol>
          <div><a class="btn btn-gold" routerLink="/histoire">Lire l’histoire du collège</a></div>
        </div>
      </div>
    </section>

    <!-- Archive strip -->
    <section class="mx-auto grid max-w-6xl gap-6 px-4 py-16" aria-labelledby="archives-title">
      <div class="grid gap-2">
        <p class="kicker">Archives photographiques</p>
        <h2 id="archives-title" class="m-0 text-3xl">Le collège en images</h2>
      </div>
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        @for (p of archive; track p.id) {
          <site-photo [photo]="p" aspect="4 / 3" sizes="(max-width: 640px) 100vw, 25vw" />
        }
      </div>
    </section>
  `,
  styles: `
    .btn-navy-solid { background: var(--navy-900); color: var(--cream); }
    .btn-navy-solid:hover { background: var(--navy-700); color: #fff; }
  `,
})
export class HomePage {
  protected readonly school = SCHOOL;
  protected readonly sections = SECTIONS;
  protected readonly milestones = MILESTONES;
  protected readonly hero = photo('campus-aerien');
  protected readonly inauguration = photo('inauguration-1955');
  protected readonly archive = [photo('campus-1907'), photo('freres-1926'), photo('chapelle-coupole'), photo('salle-de-classe')];
  protected readonly photoOf = photo;
}
