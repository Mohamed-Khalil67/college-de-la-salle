import { RenderMode, type ServerRoute } from '@angular/ssr';

/**
 * Render strategy per route (outputMode "static": deployable to plain Firebase Hosting).
 *
 *  - The public school pages are PRERENDERED at build time: complete HTML (with the right
 *    `<html lang dir>` for Arabic or French) for search engines and an instant first paint, then
 *    hydrated.
 *  - The exam engine, sign-in and dashboards are CLIENT-rendered: they depend on the signed-in
 *    user and live Firestore data, so there is nothing useful to render ahead of time. They are
 *    served by the CSR shell (index.csr.html) and lazy-loaded.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'ar/histoire', renderMode: RenderMode.Prerender },
  { path: 'ar/matiere/arabe', renderMode: RenderMode.Prerender },
  { path: 'fr/matiere/mathematiques', renderMode: RenderMode.Prerender },
  { path: 'fr/matiere/physique-chimie', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
