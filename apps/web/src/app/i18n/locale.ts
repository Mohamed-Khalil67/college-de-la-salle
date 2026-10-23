import { InjectionToken, type Provider } from '@angular/core';
import type { ActivatedRouteSnapshot, Data } from '@angular/router';
import type { SchoolContent } from '../school/school-content';
import { isLang, type Lang } from './lang';
import type { SiteMessages } from './messages';
import { PUBLIC_PAGES, type PublicPageId } from './pages';

/** One language of the public site: its interface words and the school's content. */
export interface SiteLocale {
  readonly lang: Lang;
  readonly messages: SiteMessages;
  readonly content: SchoolContent;
}

/**
 * The language of the current public page. Provided on each language's routes (public.routes.ts,
 * login.routes.ts), never at the root: a component that injects it outside those routes fails loudly
 * instead of silently showing French.
 */
export const LOCALE = new InjectionToken<SiteLocale>('LOCALE');

export function provideLocale(locale: SiteLocale): Provider[] {
  return [{ provide: LOCALE, useValue: locale }];
}

/** What every public route carries in `data`, written by `publicRouteData` and read back by `readPublicRoute`. */
export interface PublicRouteData {
  readonly lang: Lang;
  readonly page: PublicPageId;
  readonly description: string;
}

export function publicRouteData(data: PublicRouteData): Data {
  return { ...data };
}

function isPublicPage(value: unknown): value is PublicPageId {
  return typeof value === 'string' && (PUBLIC_PAGES as readonly string[]).includes(value);
}

/** The public data of the deepest route that has it, or null outside the public site (the spaces). */
export function readPublicRoute(root: ActivatedRouteSnapshot): PublicRouteData | null {
  let found: PublicRouteData | null = null;
  for (let route: ActivatedRouteSnapshot | null = root; route; route = route.firstChild) {
    const { lang, page, description } = route.data;
    if (isLang(lang) && isPublicPage(page) && typeof description === 'string') found = { lang, page, description };
  }
  return found;
}
