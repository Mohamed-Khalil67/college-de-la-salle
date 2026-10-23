import { DOCUMENT } from '@angular/common';
import { Component, inject } from '@angular/core';

/**
 * `<a cdlsSkipLink>Aller au contenu</a>`: the « skip to content » link, which moves focus to `<main id="contenu">`.
 * It must not rely on a bare `href="#contenu"`: the document's `<base href="/">` would resolve that to the home
 * page. The click is handled here; the `href` stays for assistive technology that lists links.
 */
@Component({
  selector: 'a[cdlsSkipLink]',
  host: { class: 'skip-link', href: '#contenu', '(click)': 'skip($event)' },
  template: `<ng-content />`,
})
export class SkipLink {
  readonly #document = inject(DOCUMENT);

  protected skip(event: Event): void {
    const main = this.#document.getElementById('contenu');
    if (!main) return;
    event.preventDefault();
    main.focus();
    main.scrollIntoView();
  }
}
