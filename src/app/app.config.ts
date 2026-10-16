import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';
import { provideFirebasePlatform } from '@exam/data-access-auth';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { ArabicTitleStrategy } from './shell/arabic-title.strategy';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

// Angular's own locale data (used by any built-in pipe or i18n API). App formatting itself goes
// through the Intl-based helpers in @exam/ui-arabic.
registerLocaleData(localeAr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Zoneless is the default since Angular v21 (and `provideExperimentalZonelessChangeDetection`
    // was renamed in v20); declared explicitly to document the contract: no zone.js is loaded, and
    // change detection is driven purely by signals.
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: ArabicTitleStrategy },
    { provide: LOCALE_ID, useValue: 'ar' },
    provideFirebasePlatform(environment),
    // Public pages are prerendered; hydration reuses that DOM (no flash, no layout shift) and
    // event replay keeps clicks made before the bundle finishes loading.
    provideClientHydration(withEventReplay()),
  ],
};
