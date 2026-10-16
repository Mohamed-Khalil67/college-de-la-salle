import { RenderMode, type ServerRoute } from '@angular/ssr';
import { SUBJECTS } from '@site/content';

/**
 * Every content page is static, so every content page is PRERENDERED at build time (complete HTML for
 * search engines and an instant first paint, then hydrated). `outputMode: "static"` makes the
 * build deployable to plain Firebase Hosting.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'histoire', renderMode: RenderMode.Prerender },
  { path: 'section-nationale', renderMode: RenderMode.Prerender },
  { path: 'bac', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  {
    path: 'matiere/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => SUBJECTS.map((s) => ({ slug: s.slug })),
  },
  // The student space depends on the signed-in user: client-rendered.
  { path: 'espace-eleve', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Client },
];
