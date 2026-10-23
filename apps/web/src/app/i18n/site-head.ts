import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { DEFAULT_LANG, LANG_META } from './lang';
import { readPublicRoute } from './locale';
import { alternates, pageUrl } from './pages';

/**
 * The site's address, for the absolute URLs of hreflang and canonical links. Set at build time with
 * `ng build --define SITE_ORIGIN="'https://…'"` (see docs/i18n.md); when empty, the links are root-relative.
 */
declare const SITE_ORIGIN: string | undefined;
const ORIGIN = typeof SITE_ORIGIN === 'string' ? SITE_ORIGIN.replace(/\/$/, '') : '';

/**
 * Keeps <html lang dir> and the language links of <head> in step with the page, on the server (so the
 * prerendered HTML is right for each language) and after each client navigation (leaving /ar for the
 * French spaces turns the page back to ltr).
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
    this.#link({ rel: 'canonical', href: ORIGIN + pageUrl(lang, route.page) });
    // Only the prerendered pages have alternates worth indexing; the login page is client-rendered.
    if (route.page === 'login') return;
    for (const alt of alternates(route.page)) this.#link({ rel: 'alternate', hreflang: alt.lang, href: ORIGIN + alt.url });
    this.#link({ rel: 'alternate', hreflang: 'x-default', href: ORIGIN + pageUrl(DEFAULT_LANG, route.page) });
  }

  #link(attributes: Readonly<Record<string, string>>): void {
    const link = this.#document.createElement('link');
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
    link.setAttribute('data-site-head', '');
    this.#document.head.appendChild(link);
  }
}
