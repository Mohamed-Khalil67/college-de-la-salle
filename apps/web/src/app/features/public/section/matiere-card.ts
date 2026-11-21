import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';
import type { MatiereGroup } from '../../../school';
import type { MatiereText } from '../../../school/school-content';

/** A subject as the card shows it: the catalogue's id, group and picture, with its words in the page's language. */
export interface MatiereCardData extends MatiereText {
  readonly id: string;
  readonly group: MatiereGroup;
  readonly image: string;
}

/** `<li siteMatiereCard [matiere]="…">`: a subject with its illustration (600 × 400 SVG). */
@Component({
  selector: 'li[siteMatiereCard]',
  imports: [NgOptimizedImage],
  host: { class: 'card' },
  template: `
    @let m = matiere();
    <div class="card__media"><img [ngSrc]="m.image" fill [alt]="m.alt" sizes="(max-width: 64rem) 100vw, 33vw" /></div>
    <div class="card__body">
      <p class="t-h3">{{ m.name }}</p>
      <p class="t-body-s t-muted">{{ m.blurb }}</p>
    </div>
  `,

})
export class MatiereCard {
  readonly matiere = input.required<MatiereCardData>();
}
