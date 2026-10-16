import { Component, computed, inject, input } from '@angular/core';
import { type PageId, subjectBySlug } from '@exam/contracts';
import { ContentStore } from '@exam/data-access-curriculum';
import { Editable } from './edit/editable';
import { TeacherMode } from './edit/teacher-mode';
import { ChapterList, Paragraphs, ResourceList, TimelineList } from './ui/blocks';
import { PracticeExams } from './ui/practice-exams';

const TITLES = {
  ar: { summary: 'العربية في مصر', timeline: 'محطات في تاريخ العربية', chapters: 'المنهج: النحو والبلاغة والأدب', resources: 'موارد وتحميلات' },
  fr: { summary: 'Présentation', timeline: 'Repères', chapters: 'Programme', resources: 'Fiches et ressources' },
} as const;

const DEFAULT_NOTE = {
  ar: 'المحتوى الحالي تمهيدي، ويراجعه المعلّمون ويعدّلونه.',
  fr: "Plan indicatif — à valider par le département avant diffusion. Les enseignants peuvent le modifier directement.",
} as const;

/**
 * `/ar/matiere/arabe`, `/fr/matiere/mathematiques`, `/fr/matiere/physique-chimie`: one layout for
 * every subject. The language (and so the direction and font) comes from the page's content, set
 * on `<html>` by the route; teachers edit each section in place.
 */
@Component({
  selector: 'portal-subject-page',
  imports: [Editable, Paragraphs, TimelineList, ChapterList, ResourceList, PracticeExams],
  template: `
    @let p = page();
    @let lang = p.lang;
    @if (subject(); as s) {
      <portal-editable [pageId]="pageId()" kind="hero" [lang]="lang">
        <header class="rounded-2xl bg-navy-900 p-6 text-cream md:p-10">
          <p class="m-0 text-sm font-semibold text-gold">{{ lang === 'fr' ? 'Thanaweya Amma' : 'الثانوية العامة' }}</p>
          <h1 class="m-0 text-3xl font-bold leading-(--leading-display) text-cream md:text-5xl" data-testid="subject-title">{{ p.hero.title }}</h1>
          @if (p.hero.subtitle) {
            <p class="m-0 mt-1 text-lg font-semibold text-gold">{{ p.hero.subtitle }}</p>
          }
          @if (p.hero.intro) {
            <p class="mb-0 mt-3 text-lg leading-relaxed text-cream/90">{{ p.hero.intro }}</p>
          }
        </header>
      </portal-editable>

      @if (isDefault()) {
        <p class="m-0 rounded-lg bg-warn-soft px-4 py-2 text-warn-strong" role="note">{{ note[lang] }}</p>
      }

      @if (p.summary || mode.enabled()) {
        <section class="grid gap-2" [attr.aria-labelledby]="'s-summary'">
          <h2 id="s-summary" class="m-0">{{ titles[lang].summary }}</h2>
          <portal-editable [pageId]="pageId()" kind="summary" [lang]="lang">
            <portal-paragraphs [text]="p.summary" />
          </portal-editable>
        </section>
      }

      @if (p.timeline.length || mode.enabled()) {
        <section class="grid gap-3" aria-labelledby="s-timeline">
          <h2 id="s-timeline" class="m-0">{{ titles[lang].timeline }}</h2>
          <portal-editable [pageId]="pageId()" kind="timeline" [lang]="lang">
            <portal-timeline-list [events]="p.timeline" />
          </portal-editable>
        </section>
      }

      <section class="grid gap-3" aria-labelledby="s-chapters">
        <h2 id="s-chapters" class="m-0">{{ titles[lang].chapters }}</h2>
        <portal-editable [pageId]="pageId()" kind="chapters" [lang]="lang">
          <portal-chapter-list [chapters]="p.chapters" />
        </portal-editable>
      </section>

      @if (p.resources.length || mode.enabled()) {
        <section class="grid gap-3" aria-labelledby="s-resources">
          <h2 id="s-resources" class="m-0">{{ titles[lang].resources }}</h2>
          <portal-editable [pageId]="pageId()" kind="resources" [lang]="lang">
            <portal-resource-list [resources]="p.resources" [lang]="lang" />
          </portal-editable>
        </section>
      }

      <portal-practice-exams [subjectId]="s.id" [lang]="lang" />
    }
  `,
  styles: `:host { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.75rem; }`,
})
export class SubjectPage {
  /** Bound from the route's `data: { pageId }`. */
  readonly pageId = input.required<PageId>();

  readonly #content = inject(ContentStore);
  protected readonly mode = inject(TeacherMode);
  protected readonly titles = TITLES;
  protected readonly note = DEFAULT_NOTE;

  protected readonly page = computed(() => this.#content.page(this.pageId())());
  protected readonly isDefault = computed(() => this.page().updatedAt === null);
  protected readonly subject = computed(() => subjectBySlug(this.pageId()));
}
