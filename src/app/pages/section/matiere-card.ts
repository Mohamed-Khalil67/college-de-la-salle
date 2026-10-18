import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';
import type { Matiere } from '../../school';

/** A subject with its illustration. The image fills a 3:2 box, so nothing shifts while it loads. */
@Component({
  selector: 'site-matiere-card',
  imports: [NgOptimizedImage],
  template: `
    @let m = matiere();
    <figure class="m-0 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div class="relative aspect-3/2 w-full bg-navy-900">
        <img fill [ngSrc]="m.image" [alt]="m.alt" sizes="(max-width: 640px) 50vw, 25vw" class="object-cover" />
      </div>
      <figcaption class="grid gap-0.5 p-3">
        <span class="font-semibold leading-snug text-navy-900" data-testid="matiere-name">{{ m.name }}</span>
        <span class="text-sm text-muted">{{ m.blurb }}</span>
      </figcaption>
    </figure>
  `,
})
export class MatiereCard {
  readonly matiere = input.required<Matiere>();
}
