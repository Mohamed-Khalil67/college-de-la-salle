import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideFirebasePlatform } from '@exam/data-access-exams';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Zoneless is the default since Angular v21 (and `provideExperimentalZonelessChangeDetection`
    // was renamed in v20); declared explicitly to document the contract: no zone.js is loaded, and
    // change detection is driven purely by signals.
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideFirebasePlatform(environment),
  ],
};
