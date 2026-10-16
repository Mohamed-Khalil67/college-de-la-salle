import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import type { ResolveFn, Routes } from '@angular/router';
import { subjectBySlug } from '@site/content';

/** Per-page meta description, set before render so it is in the prerendered HTML. */
const description: ResolveFn<boolean> = (route) => {
  const slug = route.paramMap.get('slug');
  const text = slug
    ? (subjectBySlug(slug)?.lang === 'ar'
        ? 'Langue arabe (Thanaweya Amma) au Collège de la Salle, Daher : histoire de l’arabe en Égypte, grammaire, rhétorique, littérature et exercices corrigés.'
        : `${subjectBySlug(slug)?.title ?? 'Matière'} (Thanaweya Amma) au Collège de la Salle, Daher : programme détaillé, formules clés, exercices types corrigés et conseils.`)
    : (route.data['description'] as string | undefined);
  if (text) inject(Meta).updateTag({ name: 'description', content: text });
  return true;
};

/**
 * The Arabic page needs Cairo from the first paint: preload its two weights. Done in a resolver so the
 * <link> tags are in that page's prerendered <head> (and added on client-side navigation too).
 */
const arabicFonts: ResolveFn<boolean> = (route) => {
  if (subjectBySlug(route.paramMap.get('slug') ?? '')?.lang !== 'ar') return true;
  const document = inject(DOCUMENT);
  for (const weight of [400, 700]) {
    const href = `/fonts/cairo-arabic-${weight}.woff2`;
    if (document.head.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement('link');
    // Attributes, not properties: the server-side DOM used for prerendering doesn't reflect .as.
    for (const [name, value] of [['rel', 'preload'], ['as', 'font'], ['type', 'font/woff2'], ['href', href], ['crossorigin', '']]) {
      link.setAttribute(name, value);
    }
    document.head.appendChild(link);
  }
  return true;
};

const subjectTitle: ResolveFn<string> = (route) => {
  const s = subjectBySlug(route.paramMap.get('slug') ?? '');
  return s ? s.navLabel : 'Matière introuvable';
};

/** All pages are static and prerendered (see src/app/app.routes.server.ts). */
export const SITE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: { description: 'Collège de la Salle, Daher (Le Caire, fondé en 1898) : section arabe de la Thanaweya Amma. Histoire, patrimoine et programmes détaillés des matières.' },
    resolve: { meta: description },
    loadComponent: () => import('./lib/home.page').then((m) => m.HomePage),
  },
  {
    path: 'histoire',
    title: 'Histoire & Patrimoine',
    data: { description: 'Histoire du Collège de la Salle à Daher depuis 1898 : le bâtiment en briques rouges, les nouveaux bâtiments de 1955, la chapelle de 1958, en photographies d’archives.' },
    resolve: { meta: description },
    loadComponent: () => import('./lib/history.page').then((m) => m.HistoryPage),
  },
  {
    path: 'matiere/:slug',
    title: subjectTitle,
    resolve: { meta: description, fonts: arabicFonts },
    loadComponent: () => import('./lib/subject.page').then((m) => m.SubjectPage),
  },
];
