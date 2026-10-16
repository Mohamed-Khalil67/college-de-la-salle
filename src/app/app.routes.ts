import type { Routes } from '@angular/router';
import { examinerGuard } from './shell/examiner.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/home.page').then((m) => m.HomePage),
  },
  {
    path: 'sign-in',
    title: 'دخول المُمتحِنين',
    loadComponent: () => import('./shell/sign-in.page').then((m) => m.SignInPage),
  },
  {
    path: 'examiner',
    canActivate: [examinerGuard],
    children: [
      {
        path: 'new',
        loadChildren: () =>
          import('@exam/feature-exam-creator').then((m) => m.EXAM_CREATOR_ROUTES),
      },
      {
        path: '',
        loadChildren: () =>
          import('@exam/feature-exam-history').then((m) => m.EXAM_HISTORY_ROUTES),
      },
    ],
  },
  {
    path: 'take',
    loadChildren: () => import('@exam/feature-exam-runner').then((m) => m.EXAM_RUNNER_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
