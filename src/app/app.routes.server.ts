import { RenderMode, type ServerRoute } from '@angular/ssr';
import { SUBJECT_IDS } from '@exam/contracts';

/**
 * Render strategy per route (outputMode "static": deployable to plain Firebase Hosting).
 *
 *  - Public school pages are PRERENDERED at build time: complete HTML for search engines and an
 *    instant first paint, then hydrated.
 *  - The exam engine, sign-in and dashboards are CLIENT-rendered: they depend on the signed-in
 *    user and live Firestore data, so there is nothing useful to render ahead of time. They are
 *    served by the CSR shell (index.csr.html) and lazy-loaded.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'about/history', renderMode: RenderMode.Prerender },
  { path: 'about/news', renderMode: RenderMode.Prerender },
  { path: 'about/gallery', renderMode: RenderMode.Prerender },
  { path: 'sections/arabic', renderMode: RenderMode.Prerender },
  {
    path: 'subjects/:subjectId',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => SUBJECT_IDS.map((subjectId) => ({ subjectId })),
  },
  { path: '**', renderMode: RenderMode.Client },
];
