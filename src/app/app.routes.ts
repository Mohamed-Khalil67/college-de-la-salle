import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('@site/pages').then((m) => m.SITE_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
