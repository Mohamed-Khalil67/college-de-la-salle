import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('@site/pages').then((m) => m.SITE_ROUTES),
  },
  {
    path: 'espace-eleve',
    title: 'Espace élève',
    loadComponent: () => import('@site/space/student').then((m) => m.StudentPage),
  },
  {
    path: 'espace-enseignant',
    title: 'Espace enseignant',
    loadComponent: () => import('@site/space/teacher').then((m) => m.TeacherPage),
  },
  { path: '**', redirectTo: '' },
];
