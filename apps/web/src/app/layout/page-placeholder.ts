import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EmptyState } from '../ui';

/** Stands in for a space page that is not built yet: says so instead of showing a blank screen. */
@Component({
  selector: 'app-page-placeholder',
  imports: [EmptyState],
  template: `
    <div class="page__header">
      <div class="page__header-text"><h1 class="t-h1">{{ title }}</h1></div>
    </div>
    <cdls-empty-state icon="clock" title="Cette page arrive bientôt" description="Elle fait partie de la prochaine version de l’espace." />
  `,
})
export class PagePlaceholder {
  protected readonly title = inject(ActivatedRoute).snapshot.title ?? '';
}
