import type { Routes } from '@angular/router';

export * from './lib/exam-form.model';

/** Mounted at /examiner/exams: re-opens an existing exam in the editor. */
export const EXAM_EDITOR_ROUTES: Routes = [
  {
    path: ':examId/edit',
    title: 'تعديل الاختبار',
    loadComponent: () => import('./lib/exam-creator.page').then((m) => m.ExamCreatorPage),
  },
];

export const EXAM_CREATOR_ROUTES: Routes = [
  {
    path: '',
    title: 'اختبار جديد',
    loadComponent: () => import('./lib/exam-creator.page').then((m) => m.ExamCreatorPage),
  },
];
