import type { Routes } from '@angular/router';
import { provideLocale, publicRouteData, type SiteLocale } from '../../i18n/locale';

/** The login page in one language (/connexion, /en/login, /ar/login): client-rendered, the guard sits in app.routes.ts. */
export function loginRoutes(locale: SiteLocale): Routes {
  const { title, description } = locale.messages.pages.login;
  return [
    {
      path: '',
      pathMatch: 'full',
      title,
      providers: provideLocale(locale),
      data: publicRouteData({ lang: locale.lang, page: 'login', description }),
      loadComponent: () => import('./login-page').then((m) => m.LoginPage),
    },
  ];
}
