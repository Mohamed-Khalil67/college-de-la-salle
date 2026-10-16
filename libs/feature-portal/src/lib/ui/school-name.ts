import { Component, inject } from '@angular/core';
import { CurriculumStore } from '@exam/data-access-curriculum';

/**
 * The institutional name in French, isolated inside Arabic text: `lang="fr"` (correct hyphenation,
 * screen-reader voice), `dir="ltr"` and `<bdi>` so "Collège de la Salle" never reorders the Arabic
 * sentence around it — e.g. a trailing comma or number stays on the correct side.
 */
@Component({
  selector: 'portal-school-name',
  template: `<bdi class="latin-brand" lang="fr" dir="ltr">{{ store.school().latinName }}</bdi>`,
  styles: `
    .latin-brand {
      font-family: var(--font-latin);
      font-style: normal;
      letter-spacing: 0.01em;
      /* Latin has no tashkeel; keep the Arabic line box so mixed lines don't jump. */
      line-height: inherit;
      unicode-bidi: isolate;
      /* The institutional name is one unit: never break "Collège de la / Salle" across lines. */
      white-space: nowrap;
    }
  `,
})
export class SchoolName {
  protected readonly store = inject(CurriculumStore);
}
