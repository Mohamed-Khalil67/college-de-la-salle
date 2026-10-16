import type { Routes } from '@angular/router';

export * from './lib/exam-form.model';

export const EXAM_CREATOR_ROUTES: Routes = [
  {
    path: '',
    title: 'اختبار جديد',
    loadComponent: () => import('./lib/exam-creator.page').then((m) => m.ExamCreatorPage),
  },
];
