import { inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';

/**
 * Per-page description for search engines and link previews. Runs during prerender, so the tags
 * are in the static HTML. Call from a component field initializer (injection context).
 */
export function setPageMeta(description: string): void {
  const meta = inject(Meta);
  meta.updateTag({ name: 'description', content: description });
  meta.updateTag({ property: 'og:description', content: description });
  meta.updateTag({ property: 'og:locale', content: 'ar_EG' });
}
