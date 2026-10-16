import type { Routes } from '@angular/router';
import { roleGuard } from '@exam/data-access-auth';
import { withLang } from '@exam/ui-arabic';

/**
 * Two tiers:
 *  - the public school portal (prerendered for SEO and instant first paint), flat navigation, with
 *    Arabic (RTL) and French (LTR) pages, and
 *  - the exam engine and teacher/admin tools (lazy-loaded, client-rendered, role-guarded).
 * Render modes per route live in app.routes.server.ts.
 *
 * Every route declares its language through `withLang`, which sets `<html lang dir>` before render.
 */
export const routes: Routes = [
  /* ------------------------------------------------------------ Public portal (prerendered) */
  {
    path: '',
    loadChildren: () => import('@exam/feature-portal').then((m) => m.PORTAL_ROUTES),
  },

  /* ------------------------------------------------------------ Exam engine (client) */
  withLang('ar', {
    path: 'exams',
    title: 'بنك الامتحانات',
    loadComponent: () => import('./shell/exams-home.page').then((m) => m.ExamsHomePage),
  }),
  withLang('ar', {
    path: 'take',
    loadChildren: () => import('@exam/feature-exam-runner').then((m) => m.EXAM_RUNNER_ROUTES),
  }),
  withLang('ar', {
    path: 'sign-in',
    title: 'تسجيل الدخول',
    loadComponent: () => import('./shell/sign-in.page').then((m) => m.SignInPage),
  }),
  withLang('ar', {
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
  }),
  withLang('ar', {
    path: 'admin',
    canActivate: [roleGuard('super_admin')],
    loadChildren: () => import('@exam/feature-admin-panel').then((m) => m.ADMIN_PANEL_ROUTES),
  }),
  { path: '**', redirectTo: '' },
];
