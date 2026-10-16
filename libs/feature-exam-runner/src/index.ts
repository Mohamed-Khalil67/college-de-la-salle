import type { Routes } from '@angular/router';

export * from './lib/exam-runner.machine';

export const EXAM_RUNNER_ROUTES: Routes = [
  {
    path: ':code',
    title: 'أداء الاختبار',
    loadComponent: () => import('./lib/exam-runner.page').then((m) => m.ExamRunnerPage),
  },
];
