import { DOCUMENT } from '@angular/common';
import { Service, computed, inject, signal } from '@angular/core';
import type { Route } from '@angular/router';
import type { PageLang } from '@exam/contracts';

/**
 * Language and direction of the current page. Arabic routes are RTL (`lang="ar"`), French routes
 * are LTR (`lang="fr"`); the font stack follows through `:root:lang(fr)` in styles.scss.
 *
 * The attributes live on `<html>` so they are part of the prerendered HTML of each page, and so CSS
 * `:lang()` and `:dir()` selectors, the CDK `Directionality`, and assistive technology all agree.
 */
@Service()
export class PageLanguage {
  readonly #root = inject(DOCUMENT).documentElement;
  readonly #lang = signal<PageLang>('ar');

  readonly lang = this.#lang.asReadonly();
  readonly dir = computed<'rtl' | 'ltr'>(() => (this.#lang() === 'fr' ? 'ltr' : 'rtl'));

  set(lang: PageLang): void {
    this.#lang.set(lang);
    this.#root.setAttribute('lang', lang);
    this.#root.setAttribute('dir', lang === 'fr' ? 'ltr' : 'rtl');
  }
}

/**
 * Marks a route as Arabic or French. A resolver (not an effect) so the attributes are set before
 * the page renders — on the server during prerender, and on the client during navigation.
 */
export function withLang(lang: PageLang, route: Route): Route {
  return {
    ...route,
    data: { ...route.data, lang },
    resolve: {
      ...route.resolve,
      lang: () => {
        inject(PageLanguage).set(lang);
        return lang;
      },
    },
  };
}
