import { inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import type { ResolveFn, Routes } from '@angular/router';

/** Per-page meta description, set before render so it is in the prerendered HTML. */
const description: ResolveFn<boolean> = (route) => {
  const text = route.data['description'] as string | undefined;
  if (text) inject(Meta).updateTag({ name: 'description', content: text });
  return true;
};

/** All pages are static and prerendered (see src/app/app.routes.server.ts). */
export const PUBLIC_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: { description: 'Collège de la Salle, Daher (Le Caire, fondé en 1898) : Bac nationale et Bac français. Histoire, patrimoine, matières, espace élève et espace enseignant.' },
    resolve: { meta: description },
    loadComponent: () => import('./home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'histoire',
    title: 'Histoire & Patrimoine',
    data: { description: 'Histoire du Collège de la Salle à Daher depuis 1898 : le bâtiment en briques rouges, les nouveaux bâtiments de 1955, la chapelle de 1958, en photographies d’archives.' },
    resolve: { meta: description },
    loadComponent: () => import('./history/history-page').then((m) => m.HistoryPage),
  },
  {
    path: 'bac-nationale',
    title: 'Bac nationale',
    data: { section: 'nationale', description: 'Bac nationale (Thanaweya Amma) au Collège de la Salle, Daher : programme du ministère égyptien, matières, espace élève et inscription.' },
    resolve: { meta: description },
    loadComponent: () => import('./section/section-page').then((m) => m.SectionPage),
  },
  {
    path: 'bac-francais',
    title: 'Bac français',
    data: { section: 'bac', description: 'Bac français au Collège de la Salle, Daher : baccalauréat français, homologation AEFE, pédagogie, orientation, effectifs et inscription.' },
    resolve: { meta: description },
    loadComponent: () => import('./section/section-page').then((m) => m.SectionPage),
  },
  {
    path: 'contact',
    title: 'Contact',
    data: { description: 'Adresse, e-mail et numéros de téléphone du Collège de la Salle, Daher, par service et par cycle.' },
    resolve: { meta: description },
    loadComponent: () => import('./contact/contact-page').then((m) => m.ContactPage),
  },
];
