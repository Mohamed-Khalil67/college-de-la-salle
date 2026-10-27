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
    <img class="card__media" [ngSrc]="m.image" width="600" height="400" [alt]="m.alt" sizes="(max-width: 64rem) 100vw, 33vw" />
    <div class="card__body">
      <p class="t-h3">{{ m.name }}</p>
      <p class="t-body-s t-muted">{{ m.blurb }}</p>
    </div>
  `,
  styles: `
    /* The width/height attributes reserve space; height: auto lets aspect-ratio and the width decide. */
    .card__media {
      height: auto;
    }
  `,
})
export class MatiereCard {
  readonly matiere = input.required<MatiereCardData>();
}
