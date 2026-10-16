import { Injectable, inject } from '@angular/core';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, Title, withEventReplay } from '@angular/platform-browser';
import {
  provideRouter,
  type RouterStateSnapshot,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { routes } from './app.routes';

/** « Page — Collège de la Salle Daher » in the browser tab. */
@Injectable()
class SiteTitleStrategy extends TitleStrategy {
  readonly #title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    const site = 'Collège de la Salle — Daher';
    this.#title.setTitle(page ? `${page} — ${site}` : `${site} · Section arabe`);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Zoneless: no zone.js is loaded; change detection is driven by signals.
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // In-page links (« Sur cette page », #matieres) scroll to their anchor; new pages start at the top.
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    { provide: TitleStrategy, useClass: SiteTitleStrategy },
    { provide: LOCALE_ID, useValue: 'fr' },
    // Every page is prerendered; hydration reuses that DOM (no flash, no layout shift) and event
    // replay keeps clicks made before the bundle finishes loading.
    provideClientHydration(withEventReplay()),
  ],
};
