import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SUBJECTS } from '@exam/contracts';
import { ContentStore } from '@exam/data-access-curriculum';
import { Editable } from './edit/editable';
import { TeacherMode } from './edit/teacher-mode';
import { AnnouncementList } from './ui/blocks';
import { HeritageShowcase } from './ui/heritage-showcase';
import { BLUR_PLACEHOLDER } from './ui/images';
import { SchoolName } from './ui/school-name';

/** `/` — Accueil. Prerendered; teachers edit the hero and the announcements in place. */
@Component({
  selector: 'portal-home-page',
  imports: [NgOptimizedImage, RouterLink, Editable, AnnouncementList, HeritageShowcase, SchoolName],
  template: `
    @let page = home();
    <section class="rounded-2xl bg-navy-900 p-6 text-cream md:p-10" aria-labelledby="hero-title">
      <portal-editable pageId="home" kind="hero" lang="ar">
        <div class="grid items-center gap-8 md:grid-cols-2">
          <div class="grid content-start gap-3">
            <p class="m-0 text-sm font-semibold tracking-normal text-gold">
              <portal-school-name /> · الظاهر
            </p>
            <h1 id="hero-title" class="m-0 text-3xl font-bold leading-(--leading-display) text-cream md:text-5xl">{{ page.hero.title }}</h1>
            @if (page.hero.subtitle) {
              <p class="m-0 text-lg font-semibold text-gold">{{ page.hero.subtitle }}</p>
            }
            @if (page.hero.intro) {
              <p class="m-0 text-lg leading-loose text-cream/90">{{ page.hero.intro }}</p>
            }
            <div class="mt-2 flex flex-wrap gap-3">
              <a class="button primary hero-cta" routerLink="/ar/matiere/arabe">اللغة العربية</a>
              <a class="button hero-cta-secondary" routerLink="/exams">بنك الامتحانات</a>
            </div>
          </div>
          <div class="relative aspect-3/2 w-full overflow-hidden rounded-xl border border-gold/60">
            <img
              fill
              priority
              ngSrc="/images/hero.svg"
              [placeholder]="blur"
              sizes="(max-width: 768px) 100vw, 50vw"
              alt="رسم توضيحي لمبنى المدرسة من الطوب الأحمر على الطراز الكلاسيكي الجديد"
              class="object-cover"
            />
          </div>
        </div>
      </portal-editable>
    </section>

    <section aria-labelledby="subjects-title" class="grid gap-4">
      <h2 id="subjects-title" class="m-0">المواد الدراسية</h2>
      <ul class="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        @for (s of subjects(); track s.id) {
          <li>
            <a
              class="grid h-full gap-1 rounded-xl border border-line border-t-4 border-t-gold bg-surface p-5 no-underline hover:border-accent hover:bg-accent-soft"
              [routerLink]="s.link"
              [attr.lang]="s.lang"
              [attr.dir]="s.lang === 'fr' ? 'ltr' : 'rtl'"
              [attr.data-testid]="'subject-' + s.slug"
            >
              <span class="font-display text-2xl font-bold text-accent-strong">{{ s.name }}</span>
              <span class="text-muted">{{ s.tagline }}</span>
            </a>
          </li>
        }
      </ul>
    </section>

    <portal-heritage-showcase [events]="history().timeline" title="تراث المدرسة منذ ١٨٩٨" />

    @if (page.announcements.length || mode.enabled()) {
      <section aria-labelledby="news-title" class="grid gap-3">
        <h2 id="news-title" class="m-0">الإعلانات والأخبار</h2>
        <portal-editable pageId="home" kind="announcements" lang="ar">
          <portal-announcement-list [announcements]="page.announcements" [limit]="6" />
        </portal-editable>
        @if (isDefault()) {
          <p class="m-0 text-sm text-muted">إعلانات تجريبية، يستبدلها المعلّمون بإعلانات المدرسة.</p>
        }
      </section>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2.5rem; }
    .hero-cta { background: var(--gold); border-color: var(--gold); color: #0a192f; }
    .hero-cta:hover:not(:disabled) { background: #d8bf96; border-color: #d8bf96; color: #0a192f; }
    .hero-cta-secondary { background: transparent; border-color: var(--gold); color: #f5ebe0; }
    .hero-cta-secondary:hover { background: rgb(197 168 128 / 0.15); color: #f5ebe0; }
  `,
})
export class HomePage {
  readonly #content = inject(ContentStore);
  protected readonly mode = inject(TeacherMode);
  protected readonly blur = BLUR_PLACEHOLDER;

  protected readonly home = this.#content.page('home');
  protected readonly history = this.#content.page('history');
  protected readonly isDefault = this.#content.isDefault('home');

  protected readonly subjects = computed(() =>
    SUBJECTS.map((s) => ({
      ...s,
      link: ['/', s.lang, 'matiere', s.slug],
      tagline: this.#content.page(s.slug)().hero.subtitle,
    })),
  );
}
