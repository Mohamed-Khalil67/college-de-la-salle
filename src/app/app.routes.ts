import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./pages/pages.routes').then((m) => m.SITE_ROUTES),
  },
  {
    path: 'espace-eleve',
    title: 'Espace élève',
    loadComponent: () => import('./space/student-space/student-page').then((m) => m.StudentPage),
  },
  {
    path: 'espace-enseignant',
    title: 'Espace enseignant',
    loadComponent: () => import('./space/teacher-space/teacher-page').then((m) => m.TeacherPage),
  },
  { path: '**', redirectTo: '' },
];
