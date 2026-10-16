import type { Routes } from '@angular/router';
import { roleGuard } from '@exam/data-access-auth';

/**
 * Two tiers:
 *  - the public school portal (prerendered for SEO and instant first paint), and
 *  - the exam engine and administration (lazy-loaded, client-rendered, role-guarded).
 * Render modes per route live in app.routes.server.ts.
 */
export const routes: Routes = [
  /* ------------------------------------------------------------ Public portal (prerendered) */
  {
    path: '',
    loadChildren: () => import('@exam/feature-portal').then((m) => m.PORTAL_ROUTES),
  },

  /* ------------------------------------------------------------ Exam engine (client) */
  {
    path: 'exams',
    title: 'الاختبارات',
    loadComponent: () => import('./shell/exams-home.page').then((m) => m.ExamsHomePage),
  },
  {
    path: 'take',
    loadChildren: () => import('@exam/feature-exam-runner').then((m) => m.EXAM_RUNNER_ROUTES),
  },
  {
    path: 'sign-in',
    title: 'تسجيل الدخول',
    loadComponent: () => import('./shell/sign-in.page').then((m) => m.SignInPage),
  },
  {
    path: 'examiner',
    canActivate: [roleGuard('examiner')],
    children: [
      {
        path: 'new',
        loadChildren: () => import('@exam/feature-exam-creator').then((m) => m.EXAM_CREATOR_ROUTES),
      },
      {
        path: 'exams',
        loadChildren: () => import('@exam/feature-exam-creator').then((m) => m.EXAM_EDITOR_ROUTES),
      },
      {
        path: '',
        loadChildren: () => import('@exam/feature-exam-history').then((m) => m.EXAM_HISTORY_ROUTES),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [roleGuard('super_admin')],
    loadChildren: () => import('@exam/feature-admin-panel').then((m) => m.ADMIN_PANEL_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
