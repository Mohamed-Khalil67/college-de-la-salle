import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { PROFILE } from '../core/school/school-profile';
import { DEFAULT_LANG, LANG_META } from './lang';
import { readPublicRoute } from './locale';
import { canonicalPageUrl } from './pages';

/**
 * The site's address, for the absolute canonical link (search engines ignore relative ones): the school profile's
 * `siteUrl`, or the build's `PUBLIC_WEB_URL` (scripts/site-origin.mjs, docs/i18n.md).
 */
const ORIGIN = PROFILE.siteUrl.replace(/\/+$/, '');

/**
 * Keeps <html lang dir>, the canonical link and the description of <head> in step with the page, on the server (so
 * the prerendered HTML is complete) and after each client navigation (the spaces get no description or locale).
 */
@Service()
export class SiteHead {
  readonly #document = inject(DOCUMENT);
  readonly #meta = inject(Meta);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  /** Called once by the root component, before the first navigation ends. */
  start(): void {
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe(() => this.#update());
  }

  #update(): void {
    const route = readPublicRoute(this.#router.routerState.snapshot.root);
    const lang = route?.lang ?? DEFAULT_LANG;
    const html = this.#document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', LANG_META[lang].dir);

    for (const link of Array.from(this.#document.head.querySelectorAll('link[data-site-head]'))) link.remove();
    if (!route) {
      // The spaces are private pages: no description or locale left over from a public page.
      this.#meta.removeTag('name="description"');
      this.#meta.removeTag('property="og:locale"');
      return;
    }

    this.#meta.updateTag({ name: 'description', content: route.description });
    this.#meta.updateTag({ property: 'og:locale', content: LANG_META[lang].ogLocale });
    this.#link({ rel: 'canonical', href: ORIGIN + canonicalPageUrl(route.page) });
  }

  #link(attributes: Readonly<Record<string, string>>): void {
    const link = this.#document.createElement('link');
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
    link.setAttribute('data-site-head', '');
    this.#document.head.appendChild(link);
  }
}
