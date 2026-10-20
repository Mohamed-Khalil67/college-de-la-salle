import type { Routes } from '@angular/router';
import type { SpaceNavItem } from '../layout/space-layout';

export const ADMIN_NAV: readonly SpaceNavItem[] = [
  { label: 'Utilisateurs', path: 'utilisateurs', icon: 'users' },
  { label: 'Classes', path: 'classes', icon: 'book' },
  { label: 'Affectations', path: 'affectations', icon: 'edit' },
  { label: 'Années et trimestres', path: 'annees', icon: 'calendar', short: 'Années' },
  { label: 'Bulletins', path: 'bulletins', icon: 'printer' },
];

const placeholder = () => import('../layout/page-placeholder').then((m) => m.PagePlaceholder);

/** The administration (/admin). Pages are ported from design/prototypes/admin-*.html. */
export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'utilisateurs' },
  { path: 'utilisateurs', title: 'Utilisateurs', loadComponent: placeholder },
  { path: 'classes', title: 'Classes', loadComponent: placeholder },
  { path: 'affectations', title: 'Affectations', loadComponent: placeholder },
  { path: 'annees', title: 'Années et trimestres', loadComponent: placeholder },
  { path: 'bulletins', title: 'Bulletins', loadComponent: placeholder },
];
