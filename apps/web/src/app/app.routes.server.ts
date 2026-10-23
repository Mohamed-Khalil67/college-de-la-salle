import { RenderMode, type ServerRoute } from '@angular/ssr';
import { LANGS } from './i18n/lang';
import { PRERENDERED_PAGES, routePath } from './i18n/pages';

/**
 * The public pages are static: PRERENDERED at build time in each language (complete HTML for search engines
 * and an instant first paint, then hydrated). Login and the spaces depend on the signed-in user: client-rendered.
 */
export const serverRoutes: ServerRoute[] = [
  ...LANGS.flatMap((lang) =>
    PRERENDERED_PAGES.map((page): ServerRoute => ({ path: routePath(lang, page), renderMode: RenderMode.Prerender })),
  ),
  { path: '**', renderMode: RenderMode.Client },
];
