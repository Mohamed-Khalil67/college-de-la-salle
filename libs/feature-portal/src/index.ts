import { inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import type { ResolveFn, Routes } from '@angular/router';
import { CurriculumStore } from '@exam/data-access-curriculum';

export { SchoolName } from './lib/ui/school-name';

/** Subject pages get their own title (route titles are otherwise static). Runs during prerender. */
const subjectTitle: ResolveFn<string> = (route) =>
  inject(CurriculumStore).subject(route.paramMap.get('subjectId') ?? '')?.name ?? 'مادة غير موجودة';

/** Per-subject meta description, set before the page renders so it lands in the prerendered HTML. */
const subjectMeta: ResolveFn<boolean> = (route) => {
  const subject = inject(CurriculumStore).subject(route.paramMap.get('subjectId') ?? '');
  if (subject) {
    inject(Meta).updateTag({ name: 'description', content: `${subject.name} في الثانوية العامة: ${subject.overview}` });
  }
  return true;
};

/**
 * Public portal. Every route here is prerendered (see src/app/app.routes.server.ts) for instant
 * first paint and SEO; components are still lazy-loaded per route on the client.
 */
export const PORTAL_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./lib/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'about',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'history' },
      {
        path: 'history',
        title: 'تاريخ المدرسة',
        loadComponent: () => import('./lib/about/about.pages').then((m) => m.HistoryPage),
      },
      {
        path: 'news',
        title: 'الأخبار',
        loadComponent: () => import('./lib/about/about.pages').then((m) => m.NewsPage),
      },
      {
        path: 'gallery',
        title: 'معرض الصور',
        loadComponent: () => import('./lib/about/about.pages').then((m) => m.GalleryPage),
      },
    ],
  },
  {
    path: 'sections/arabic',
    title: 'القسم العربي',
    loadComponent: () => import('./lib/arabic-section.page').then((m) => m.ArabicSectionPage),
  },
  {
    path: 'subjects/:subjectId',
    title: subjectTitle,
    resolve: { meta: subjectMeta },
    loadComponent: () => import('./lib/subject-hub.page').then((m) => m.SubjectHubPage),
  },
];
