import type { Routes } from '@angular/router';

export const EXAM_HISTORY_ROUTES: Routes = [
  {
    path: '',
    title: 'لوحة المُمتحِن',
    loadComponent: () =>
      import('./lib/examiner-dashboard.page').then((m) => m.ExaminerDashboardPage),
  },
];
