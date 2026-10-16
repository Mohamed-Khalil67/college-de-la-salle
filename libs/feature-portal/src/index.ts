import { inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import type { ResolveFn, Routes } from '@angular/router';
import type { PageLang } from '@exam/contracts';
import { withLang } from '@exam/ui-arabic';

export { TeacherBar, TeacherMode } from './lib/edit/teacher-mode';
export { SchoolName } from './lib/ui/school-name';

/** `data: { description, lang }` → meta tags, set before render so they are in the prerendered HTML. */
const pageMeta: ResolveFn<boolean> = (route) => {
  const description = route.data['description'];
  const lang: PageLang = route.data['lang'] === 'fr' ? 'fr' : 'ar';
  const meta = inject(Meta);
  if (typeof description === 'string') {
    meta.updateTag({ name: 'description', content: description });
    meta.updateTag({ property: 'og:description', content: description });
  }
  meta.updateTag({ property: 'og:locale', content: lang === 'fr' ? 'fr_FR' : 'ar_EG' });
  return true;
};

/**
 * The public portal. Flat structure: no nested menus. Arabic pages live under `/` and `/ar/…`,
 * French subject pages under `/fr/…`; each route declares its language (and so its direction).
 * All of these are prerendered (see src/app/app.routes.server.ts).
 */
export const PORTAL_ROUTES: Routes = [
  withLang('ar', {
    path: '',
    pathMatch: 'full',
    data: {
      description:
        'مدرسة Collège de la Salle بالظاهر (تأسست ١٨٩٨): الثانوية العامة — القسم العربي. اللغة العربية والرياضيات والفيزياء والكيمياء، واختبارات تدريبية مؤقَّتة.',
    },
    resolve: { meta: pageMeta },
    loadComponent: () => import('./lib/home.page').then((m) => m.HomePage),
  }),
  withLang('ar', {
    path: 'ar/histoire',
    title: 'عن المدرسة وتاريخها',
    data: { description: 'تاريخ مدرسة Collège de la Salle بالظاهر: التأسيس عام ١٨٩٨، ومبنى الطوب الأحمر، وكنيسة دي لا سال، والاندماج مع أقسام خورنفش.' },
    resolve: { meta: pageMeta },
    loadComponent: () => import('./lib/history.page').then((m) => m.HistoryPage),
  }),
  withLang('ar', {
    path: 'ar/matiere/arabe',
    title: 'اللغة العربية',
    data: {
      pageId: 'arabe',
      description: 'اللغة العربية في الثانوية العامة: تاريخ العربية وأدبها في مصر، ووحدات النحو والبلاغة والأدب، واختبارات تدريبية مؤقَّتة.',
    },
    resolve: { meta: pageMeta },
    loadComponent: () => import('./lib/subject.page').then((m) => m.SubjectPage),
  }),
  withLang('fr', {
    path: 'fr/matiere/mathematiques',
    title: 'Mathématiques',
    data: {
      pageId: 'mathematiques',
      description: "Mathématiques (Thanaweya Amma, programme en français) : analyse, algèbre, géométrie dans l'espace, statique et dynamique, avec examens d'entraînement chronométrés.",
    },
    resolve: { meta: pageMeta },
    loadComponent: () => import('./lib/subject.page').then((m) => m.SubjectPage),
  }),
  withLang('fr', {
    path: 'fr/matiere/physique-chimie',
    title: 'Physique-Chimie',
    data: {
      pageId: 'physique-chimie',
      description: "Physique-Chimie (Thanaweya Amma, programme en français) : électricité, physique moderne, équilibre chimique, électrochimie et chimie organique, avec examens d'entraînement.",
    },
    resolve: { meta: pageMeta },
    loadComponent: () => import('./lib/subject.page').then((m) => m.SubjectPage),
  }),
];
