import { Component, inject } from '@angular/core';
import { ContentStore } from '@exam/data-access-curriculum';
import { Editable } from './edit/editable';
import { Paragraphs } from './ui/blocks';
import { HeritageShowcase } from './ui/heritage-showcase';
import { SchoolName } from './ui/school-name';

/** `/ar/histoire` — Histoire & Patrimoine: the school's story and the interactive archive. */
@Component({
  selector: 'portal-history-page',
  imports: [Editable, HeritageShowcase, Paragraphs, SchoolName],
  template: `
    @let page = history();
    <portal-editable pageId="history" kind="hero" lang="ar">
      <header class="grid gap-1">
        <p class="eyebrow m-0"><portal-school-name /> · الظاهر</p>
        <h1 class="m-0">{{ page.hero.title }}</h1>
        @if (page.hero.subtitle) {
          <p class="m-0 text-lg font-semibold text-muted" lang="fr" dir="ltr">{{ page.hero.subtitle }}</p>
        }
        @if (page.hero.intro) {
          <p class="m-0 text-lg">{{ page.hero.intro }}</p>
        }
      </header>
    </portal-editable>

    @if (isDefault()) {
      <p class="m-0 rounded-lg bg-warn-soft px-4 py-2 text-warn-strong" role="note">
        التواريخ مُعتمَدة من إدارة المدرسة؛ أما الصياغة فتمهيدية بانتظار النصّ الرسمي.
      </p>
    }

    <portal-editable pageId="history" kind="summary" lang="ar">
      <portal-paragraphs [text]="page.summary" />
    </portal-editable>

    <portal-editable pageId="history" kind="timeline" lang="ar">
      <portal-heritage-showcase [events]="page.timeline" title="محطات في تاريخ المدرسة" />
    </portal-editable>
  `,
  styles: `:host { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.75rem; }`,
})
export class HistoryPage {
  protected readonly history = inject(ContentStore).page('history');
  protected readonly isDefault = inject(ContentStore).isDefault('history');
}
