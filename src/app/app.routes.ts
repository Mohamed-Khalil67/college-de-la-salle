import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('@site/pages').then((m) => m.SITE_ROUTES),
  },
  {
    path: 'espace-eleve',
    title: 'Espace élève',
    loadComponent: () => import('@site/student/account').then((m) => m.AccountPage),
  },
  { path: '**', redirectTo: '' },
];
