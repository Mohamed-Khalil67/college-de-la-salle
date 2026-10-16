import { RenderMode, type ServerRoute } from '@angular/ssr';
import { SUBJECTS } from '@site/content';

/**
 * Every page is static content, so every page is PRERENDERED at build time (complete HTML for
 * search engines and an instant first paint, then hydrated). `outputMode: "static"` makes the
 * build deployable to plain Firebase Hosting.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'histoire', renderMode: RenderMode.Prerender },
  {
    path: 'matiere/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => SUBJECTS.map((s) => ({ slug: s.slug })),
  },
  { path: '**', renderMode: RenderMode.Client },
];
