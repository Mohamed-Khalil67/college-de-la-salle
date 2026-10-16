import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type Chapter, type ChapterStatus, type Lang, photo, subjectBySlug } from '@site/content';
import { favouriteId, progressPercent, StudentService } from '@site/student';
import { SitePhoto } from './ui/site-photo';

const LABELS = {
  fr: {
    onThisPage: 'Sur cette page',
    context: 'Contexte',
    program: 'Programme',
    formulas: 'Formules clés',
    examples: 'Exercices types corrigés',
    tips: 'Méthode et conseils',
    resources: 'Ressources',
    status: 'Statut du programme',
    objectives: 'Objectifs',
    notions: 'Notions clés',
    solution: 'Voir la correction',
    answer: 'Réponse',
    soon: 'Bientôt disponible',
    open: 'Ouvrir',
    chapter: 'Chapitre',
    progress: (done: number, total: number) => `${done} chapitre${done > 1 ? 's' : ''} terminé${done > 1 ? 's' : ''} sur ${total}`,
    statusNote: 'Le statut de chaque chapitre est mis à jour par les enseignants au fil de l’année scolaire.',
    revised: 'J’ai révisé ce chapitre',
    save: 'Enregistrer',
    saved: 'Enregistré',
    loginPrompt: 'Connectez-vous à l’espace élève pour suivre votre progression et enregistrer vos favoris.',
    loginLink: 'Espace élève',
    mine: 'Ma progression',
    mineText: (done: number, total: number) => `${done} chapitre${done > 1 ? 's' : ''} révisé${done > 1 ? 's' : ''} sur ${total}`,
  },
  ar: {
    onThisPage: 'في هذه الصفحة',
    context: 'السياق',
    program: 'المنهج',
    formulas: 'القواعد الأساسية',
    examples: 'أمثلة تطبيقية محلولة',
    tips: 'نصائح منهجية',
    resources: 'الموارد',
    status: 'حالة المنهج',
    objectives: 'الأهداف',
    notions: 'المفاهيم الأساسية',
    solution: 'عرض الحلّ',
    answer: 'الإجابة',
    soon: 'قريبًا',
    open: 'فتح',
    chapter: 'الوحدة',
    progress: (done: number, total: number) => `أُنجز ${toArabicDigits(done)} من ${toArabicDigits(total)} وحدات`,
    statusNote: 'يحدّث المعلّمون حالة كل وحدة على مدار العام الدراسي.',
    revised: 'راجعتُ هذه الوحدة',
    save: 'حفظ',
    saved: 'محفوظ',
    loginPrompt: 'سجّل الدخول إلى فضاء الطالب لمتابعة تقدّمك وحفظ مفضّلاتك.',
    loginLink: 'فضاء الطالب',
    mine: 'تقدّمي',
    mineText: (done: number, total: number) => `راجعتَ ${toArabicDigits(done)} من ${toArabicDigits(total)} وحدات`,
  },
} as const;

const STATUS: Readonly<Record<Lang, Readonly<Record<ChapterStatus, string>>>> = {
  fr: { prevu: 'Prévu', 'en-cours': 'En cours', termine: 'Terminé' },
  ar: { prevu: 'مُقرَّر', 'en-cours': 'قيد الدراسة', termine: 'مُنجَز' },
};

function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

/**
 * `/matiere/:slug` — one layout for every subject. The site and its header stay French and
 * left-to-right; only the Arabic subject's article is `lang="ar" dir="rtl"`, so its content — and
 * its table of contents — mirror while the rest of the page does not move.
 */
@Component({
  selector: 'site-subject-page',
  imports: [RouterLink, SitePhoto],
  template: `
    @if (subject(); as s) {
      @let L = labels();
      <nav class="border-b border-line bg-surface" aria-label="Fil d’Ariane">
        <ol class="mx-auto m-0 flex max-w-6xl list-none flex-wrap gap-2 px-4 py-2 text-sm text-muted">
          <li><a routerLink="/">Accueil</a></li>
          <li aria-hidden="true">/</li>
          <li><a routerLink="/" fragment="matieres">Matières</a></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{{ s.navLabel }}</li>
        </ol>
      </nav>

      <article [attr.lang]="s.lang" [attr.dir]="dir()" data-testid="subject">
        <header class="bg-navy-900 text-cream">
          <div class="on-dark mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[3fr_2fr]">
            <div class="grid gap-4">
              <p class="kicker">{{ s.kicker }}</p>
              <h1 class="m-0 text-4xl text-white md:text-5xl" data-testid="subject-title">{{ s.title }}</h1>
              <p class="m-0 text-lg text-cream/90">{{ s.intro }}</p>
              <ul class="m-0 flex list-none flex-wrap gap-3 p-0">
                @for (h of s.highlights; track h.label) {
                  <li class="rounded-xl border border-gold/50 px-4 py-2">
                    <span class="block text-2xl font-bold text-gold">{{ h.value }}</span>
                    <span class="text-sm text-cream/85">{{ h.label }}</span>
                  </li>
                }
              </ul>
            </div>
            <site-photo [photo]="heroPhoto()" aspect="4 / 3" [priority]="true" class="[&_figcaption]:text-cream/75" />
          </div>
        </header>

        <div class="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <!-- Table of contents (sticky on wide screens; mirrors with the article's direction) -->
          <nav class="lg:sticky lg:top-24 lg:self-start" [attr.aria-label]="L.onThisPage" data-testid="toc">
            <p class="kicker mb-3">{{ L.onThisPage }}</p>
            <ol class="m-0 grid list-none gap-1 p-0 text-sm">
              @for (item of toc(); track item.id) {
                <li><a class="block rounded-md px-3 py-1.5 no-underline hover:bg-navy-100" [routerLink]="[]" [fragment]="item.id">{{ item.label }}</a></li>
              }
            </ol>
            <!-- In this column (desktop only) the hint can appear after Firebase loads without moving any content. -->
            @if (student.enabled && student.ready() && !student.signedIn()) {
              <p class="mt-4 hidden rounded-xl bg-navy-100 p-3 text-sm lg:block" data-testid="login-prompt">
                {{ L.loginPrompt }} <a routerLink="/espace-eleve" class="font-semibold">{{ L.loginLink }}</a>
              </p>
            }
          </nav>

          <div class="grid min-w-0 gap-14">
            @if (s.context; as c) {
              <section id="contexte" aria-labelledby="contexte-title" class="grid gap-4">
                <h2 id="contexte-title" class="m-0 text-3xl">{{ c.title }}</h2>
                @for (p of c.paragraphs; track $index) {
                  <p class="m-0 text-lg">{{ p }}</p>
                }
                <ol class="m-0 grid list-none gap-4 border-s-2 border-gold p-0 ps-6">
                  @for (m of c.milestones; track m.period) {
                    <li><span class="font-bold text-gold-ink">{{ m.period }}</span> — {{ m.text }}</li>
                  }
                </ol>
              </section>
            }

            <section id="programme" aria-labelledby="programme-title" class="grid gap-6">
              <h2 id="programme-title" class="m-0 text-3xl">{{ L.program }}</h2>
              @for (group of parts(); track group.part) {
                <div class="grid gap-4">
                  <h3 class="m-0 text-lg text-gold-ink">{{ group.part }}</h3>
                  @for (c of group.chapters; track c.id) {
                    <article class="rounded-2xl border border-line bg-surface p-6 shadow-sm" [attr.aria-labelledby]="'ch-' + c.id" data-testid="chapter">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <h4 [id]="'ch-' + c.id" class="m-0 text-xl font-bold text-navy-900">{{ c.title }}</h4>
                        <span [class]="chipClass(c.status)" data-testid="chapter-status">{{ statusLabel(c.status) }}</span>
                      </div>
                      <p class="mb-4 mt-2 text-muted">{{ c.summary }}</p>
                      @if (student.profile()) {
                        <label class="mb-4 inline-flex cursor-pointer items-center gap-2 font-semibold" [attr.data-testid]="'revise-' + c.id">
                          <input type="checkbox" class="size-5 accent-navy-700" [checked]="student.isChapterRevised(s.slug, c.id)" (change)="toggleChapter(c.id)" />
                          {{ L.revised }}
                        </label>
                      }
                      <div class="grid gap-6 md:grid-cols-2">
                        <div>
                          <p class="mb-2 mt-0 text-sm font-semibold">{{ L.objectives }}</p>
                          <ul class="m-0 grid gap-1 ps-5">
                            @for (o of c.objectives; track $index) {
                              <li>{{ o }}</li>
                            }
                          </ul>
                        </div>
                        <div>
                          <p class="mb-2 mt-0 text-sm font-semibold">{{ L.notions }}</p>
                          <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                            @for (n of c.notions; track $index) {
                              <li class="rounded-full bg-navy-100 px-3 py-1 text-sm text-navy-700">{{ n }}</li>
                            }
                          </ul>
                        </div>
                      </div>
                    </article>
                  }
                </div>
              }
            </section>

            @if (s.formulas.length) {
              <section id="formules" aria-labelledby="formules-title" class="grid gap-4">
                <h2 id="formules-title" class="m-0 text-3xl">{{ L.formulas }}</h2>
                <dl class="m-0 grid gap-3 sm:grid-cols-2">
                  @for (f of s.formulas; track f.label; let fi = $index) {
                    <div class="rounded-xl border border-line bg-surface p-4">
                      <dt class="flex items-start justify-between gap-2 text-sm text-muted">
                        <span>{{ f.label }}</span>
                        @if (student.profile()) {
                          <button type="button" class="fav" [attr.aria-pressed]="student.isFavourite(fav(s.slug, 'fo', fi))" [attr.aria-label]="L.save + ' : ' + f.label" (click)="toggleFavourite(fav(s.slug, 'fo', fi))" [attr.data-testid]="'fav-fo-' + fi">{{ student.isFavourite(fav(s.slug, 'fo', fi)) ? '★' : '☆' }}</button>
                        }
                      </dt>
                      <dd class="m-0 mt-1 text-lg font-semibold text-navy-900"><bdi dir="ltr" data-testid="formula">{{ f.expression }}</bdi></dd>
                      @if (f.note) {
                        <dd class="m-0 text-xs text-muted">{{ f.note }}</dd>
                      }
                    </div>
                  }
                </dl>
              </section>
            }

            <section id="exercices" aria-labelledby="exercices-title" class="grid gap-4">
              <h2 id="exercices-title" class="m-0 text-3xl">{{ L.examples }}</h2>
              @for (e of s.examples; track e.title; let i = $index) {
                <article class="rounded-2xl border border-line bg-surface p-6" data-testid="example">
                  <div class="flex items-start justify-between gap-3">
                    <h3 class="m-0 text-lg">{{ i + 1 }}. {{ e.title }}</h3>
                    @if (student.profile()) {
                      <button type="button" class="fav" [attr.aria-pressed]="student.isFavourite(fav(s.slug, 'ex', i))" (click)="toggleFavourite(fav(s.slug, 'ex', i))" [attr.data-testid]="'fav-ex-' + i">
                        {{ student.isFavourite(fav(s.slug, 'ex', i)) ? '★ ' + L.saved : '☆ ' + L.save }}
                      </button>
                    }
                  </div>
                  <p class="mb-3 mt-2">{{ e.statement }}</p>
                  <details class="group rounded-xl bg-page p-4">
                    <summary class="cursor-pointer font-semibold text-navy-700">{{ L.solution }}</summary>
                    <ol class="mb-2 mt-3 grid gap-1 ps-5">
                      @for (step of e.steps; track $index) {
                        <li>{{ step }}</li>
                      }
                    </ol>
                    <p class="m-0 font-semibold">{{ L.answer }} : <span class="text-ok">{{ e.answer }}</span></p>
                  </details>
                </article>
              }
            </section>

            <section id="conseils" aria-labelledby="conseils-title" class="grid gap-4">
              <h2 id="conseils-title" class="m-0 text-3xl">{{ L.tips }}</h2>
              <div class="grid gap-4 sm:grid-cols-2">
                @for (t of s.tips; track t.title) {
                  <div class="rounded-xl border-s-4 border-gold bg-surface p-5 shadow-sm">
                    <h3 class="m-0 text-base">{{ t.title }}</h3>
                    <p class="m-0 mt-1 text-muted">{{ t.text }}</p>
                  </div>
                }
              </div>
            </section>

            <section id="ressources" aria-labelledby="ressources-title" class="grid gap-4">
              <h2 id="ressources-title" class="m-0 text-3xl">{{ L.resources }}</h2>
              <ul class="m-0 grid list-none gap-3 p-0">
                @for (r of s.resources; track r.title) {
                  <li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                    <div>
                      <p class="m-0 font-semibold">{{ r.title }}</p>
                      <p class="m-0 text-sm text-muted">{{ r.description }}</p>
                    </div>
                    @if (r.url; as url) {
                      <a class="btn btn-gold" [href]="url" target="_blank" rel="noopener noreferrer">{{ L.open }}</a>
                    } @else {
                      <span class="rounded-full bg-warn-soft px-3 py-1 text-sm font-semibold text-warn">{{ L.soon }}</span>
                    }
                  </li>
                }
              </ul>
            </section>

            <section id="statut" aria-labelledby="statut-title" class="grid gap-4" data-testid="status">
              <h2 id="statut-title" class="m-0 text-3xl">{{ L.status }}</h2>
              <p class="m-0 font-semibold">{{ progressText() }}</p>
              @if (student.profile()) {
                <div class="grid gap-2 rounded-xl bg-navy-100 p-4" data-testid="my-progress">
                  <p class="m-0 font-semibold">{{ L.mine }} : {{ myText() }}</p>
                  <div class="h-3 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="myPercent()" [attr.aria-label]="L.mine">
                    <div class="h-full rounded-full bg-navy-700" [style.inline-size.%]="myPercent()"></div>
                  </div>
                </div>
              }
              <div
                class="h-3 overflow-hidden rounded-full bg-navy-100"
                role="progressbar"
                aria-valuemin="0"
                [attr.aria-valuemax]="s.chapters.length"
                [attr.aria-valuenow]="done()"
                [attr.aria-label]="L.status"
              >
                <div class="h-full rounded-full bg-gold" [style.inline-size.%]="percent()"></div>
              </div>
              <div class="overflow-x-auto rounded-xl border border-line bg-surface">
                <table class="w-full border-collapse text-start">
                  <thead>
                    <tr class="border-b border-line text-sm text-muted">
                      <th scope="col" class="p-3 text-start font-semibold">{{ L.chapter }}</th>
                      <th scope="col" class="p-3 text-start font-semibold">{{ L.status }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of s.chapters; track c.id) {
                      <tr class="border-b border-line last:border-0">
                        <th scope="row" class="p-3 text-start font-medium">{{ c.title }}</th>
                        <td class="p-3"><span [class]="chipClass(c.status)">{{ statusLabel(c.status) }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="m-0 text-sm text-muted">{{ L.statusNote }}</p>
            </section>
          </div>
        </div>
      </article>
    } @else {
      <section class="mx-auto max-w-3xl px-4 py-20">
        <h1>Matière introuvable</h1>
        <p><a routerLink="/">Retour à l’accueil</a></p>
      </section>
    }
  `,
  styles: `
    .fav { flex-shrink: 0; padding: 0.2rem 0.7rem; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); font: inherit; font-size: 0.85rem; font-weight: 600; color: var(--navy-700); cursor: pointer; }
    .fav[aria-pressed='true'] { background: var(--navy-100); border-color: var(--navy-700); }
  `,
})
export class SubjectPage {
  protected readonly student = inject(StudentService);
  /** Bound from the `:slug` route parameter. */
  readonly slug = input.required<string>();

  protected readonly subject = computed(() => subjectBySlug(this.slug()));
  protected readonly lang = computed<Lang>(() => this.subject()?.lang ?? 'fr');
  protected readonly dir = computed(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));
  protected readonly labels = computed(() => LABELS[this.lang()]);
  protected readonly heroPhoto = computed(() => photo(this.subject()?.photo ?? 'campus-aerien'));

  protected readonly parts = computed(() => {
    const groups = new Map<string, Chapter[]>();
    for (const c of this.subject()?.chapters ?? []) groups.set(c.part, [...(groups.get(c.part) ?? []), c]);
    return [...groups].map(([part, chapters]) => ({ part, chapters }));
  });

  protected readonly toc = computed(() => {
    const s = this.subject();
    const L = this.labels();
    if (!s) return [];
    return [
      ...(s.context ? [{ id: 'contexte', label: s.context.title }] : []),
      { id: 'programme', label: L.program },
      ...(s.formulas.length ? [{ id: 'formules', label: L.formulas }] : []),
      { id: 'exercices', label: L.examples },
      { id: 'conseils', label: L.tips },
      { id: 'ressources', label: L.resources },
      { id: 'statut', label: L.status },
    ];
  });

  protected readonly done = computed(() => (this.subject()?.chapters ?? []).filter((c) => c.status === 'termine').length);
  protected readonly percent = computed(() => {
    const total = this.subject()?.chapters.length ?? 0;
    return total ? Math.round((this.done() / total) * 100) : 0;
  });
  protected readonly progressText = computed(() => this.labels().progress(this.done(), this.subject()?.chapters.length ?? 0));

  protected readonly myIds = computed(() => this.student.profile()?.progress[this.slug()] ?? []);
  protected readonly myPercent = computed(() => progressPercent(this.myIds(), (this.subject()?.chapters ?? []).map((c) => c.id)));
  protected readonly myText = computed(() => {
    const ids = (this.subject()?.chapters ?? []).map((c) => c.id);
    return this.labels().mineText(this.myIds().filter((id) => ids.includes(id)).length, ids.length);
  });

  protected fav(slug: string, kind: 'ex' | 'fo', index: number): string {
    return favouriteId(slug, kind, index);
  }

  protected toggleChapter(chapterId: string): void {
    void this.student.toggleChapter(this.slug(), chapterId).catch(() => undefined);
  }

  protected toggleFavourite(id: string): void {
    void this.student.toggleFavourite(id).catch(() => undefined);
  }

  protected statusLabel(status: ChapterStatus): string {
    return STATUS[this.lang()][status];
  }

  protected chipClass(status: ChapterStatus): string {
    const base = 'shrink-0 rounded-full px-3 py-1 text-xs font-semibold ';
    if (status === 'termine') return base + 'bg-ok-soft text-ok';
    if (status === 'en-cours') return base + 'bg-warn-soft text-warn';
    return base + 'bg-navy-100 text-navy-700';
  }
}
