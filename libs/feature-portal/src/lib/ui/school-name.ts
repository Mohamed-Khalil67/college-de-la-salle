import { Component } from '@angular/core';

/**
 * The institutional name in French, isolated inside Arabic text: `lang="fr"` (correct hyphenation,
 * screen-reader voice), `dir="ltr"` and `<bdi>`, so "Collège de la Salle" never reorders the Arabic
 * sentence around it — a trailing dash or number stays on the correct side.
 */
@Component({
  selector: 'portal-school-name',
  template: `<bdi class="latin-brand" lang="fr" dir="ltr">Collège de la Salle</bdi>`,
  styles: `
    .latin-brand {
      font-family: var(--font-latin);
      font-style: normal;
      line-height: inherit;
      unicode-bidi: isolate;
      /* The institutional name is one unit: never break "Collège de la / Salle" across lines. */
      white-space: nowrap;
    }
  `,
})
export class SchoolName {}
