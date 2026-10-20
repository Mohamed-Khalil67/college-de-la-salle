import { RenderMode, type ServerRoute } from '@angular/ssr';

/**
 * The public pages are static: PRERENDERED at build time (complete HTML for search engines and an instant
 * first paint, then hydrated). Login and the spaces depend on the signed-in user: client-rendered.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'histoire', renderMode: RenderMode.Prerender },
  { path: 'bac-nationale', renderMode: RenderMode.Prerender },
  { path: 'bac-francais', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
