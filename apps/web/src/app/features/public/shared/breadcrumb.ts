import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../../i18n/locale';
import { pageUrl } from '../../../i18n/pages';

/** `<nav siteBreadcrumb current="Contact">`: Accueil / current page, in the page's language. */
@Component({
  selector: 'nav[siteBreadcrumb]',
  imports: [RouterLink],
  host: { class: 'breadcrumb', '[attr.aria-label]': 't.breadcrumb' },
  template: `
    <ol role="list">
      <li><a [routerLink]="home">{{ t.home }}</a></li>
      <li><span aria-current="page">{{ current() }}</span></li>
    </ol>
  `,
})
export class Breadcrumb {
  readonly current = input.required<string>();

  readonly #locale = inject(LOCALE);
  protected readonly t = this.#locale.messages.common;
  protected readonly home = pageUrl(this.#locale.lang, 'home');
}
