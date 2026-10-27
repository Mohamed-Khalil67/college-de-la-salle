import type { Route, Routes } from '@angular/router';
import { provideLocale, publicRouteData, type SiteLocale } from '../../i18n/locale';
import { childPath, type PublicPageId } from '../../i18n/pages';
import { PublicLayout } from '../../layout/public-layout';
import type { SectionSlug } from '../../school';

/**
 * The public site in one language (app.routes.ts mounts it at '', 'en' and 'ar'). Every page is static and
 * prerendered (app.routes.server.ts); its title and description come from the language's messages, and its
 * data says which page it is, so the language switcher and hreflang links can find it in the other languages.
 */
export function publicRoutes(locale: SiteLocale): Routes {
  const { lang, messages } = locale;
  const page = (id: PublicPageId, loadComponent: Route['loadComponent'], section?: SectionSlug): Route => {
    const { title, description } = messages.pages[id];
    const data = publicRouteData({ lang, page: id, description });
    return {
      path: childPath(lang, id),
      pathMatch: 'full',
      // The home page has no title of its own: the strategy shows the site's full name.
      ...(title ? { title } : {}),
      // `section` is bound to SectionPage's input (withComponentInputBinding).
      data: section ? { ...data, section } : data,
      loadComponent,
    };
  };
  return [
    {
      path: '',
      component: PublicLayout,
      providers: provideLocale(locale),
      children: [
        page('home', () => import('./home/home-page').then((m) => m.HomePage)),
        page('history', () => import('./history/history-page').then((m) => m.HistoryPage)),
        page('nationale', () => import('./section/section-page').then((m) => m.SectionPage), 'nationale'),
        page('bac', () => import('./section/section-page').then((m) => m.SectionPage), 'bac'),
        page('contact', () => import('./contact/contact-page').then((m) => m.ContactPage)),
        page('accessibility', () => import('./accessibility/accessibility-page').then((m) => m.AccessibilityPage)),
      ],
    },
  ];
}
