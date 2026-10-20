import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** `<nav siteBreadcrumb current="Contact">`: Accueil / current page. */
@Component({
  selector: 'nav[siteBreadcrumb]',
  imports: [RouterLink],
  host: { class: 'breadcrumb', 'aria-label': 'Fil d’Ariane' },
  template: `
    <ol role="list">
      <li><a routerLink="/">Accueil</a></li>
      <li><span aria-current="page">{{ current() }}</span></li>
    </ol>
  `,
})
export class Breadcrumb {
  readonly current = input.required<string>();
}
