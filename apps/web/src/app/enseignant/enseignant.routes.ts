import type { Routes } from '@angular/router';
import type { SpaceNavItem } from '../layout/space-layout';

export const ENSEIGNANT_NAV: readonly SpaceNavItem[] = [
  { label: 'Mes classes', path: '', icon: 'users', short: 'Classes' },
  { label: 'Agenda', path: 'agenda', icon: 'calendar' },
  { label: 'Saisie des notes', path: 'notes', icon: 'edit', short: 'Notes' },
  { label: 'Appel', path: 'appel', icon: 'check' },
  { label: 'Annonces', path: 'annonces', icon: 'bell' },
];

const placeholder = () => import('../layout/page-placeholder').then((m) => m.PagePlaceholder);

/** The teacher space (/enseignant). Pages are ported from design/prototypes/enseignant-*.html. */
export const ENSEIGNANT_ROUTES: Routes = [
  { path: '', title: 'Mes classes', loadComponent: placeholder },
  { path: 'agenda', title: 'Agenda', loadComponent: placeholder },
  { path: 'notes', title: 'Saisie des notes', loadComponent: placeholder },
  { path: 'appel', title: 'Appel', loadComponent: placeholder },
  { path: 'annonces', title: 'Annonces', loadComponent: placeholder },
];
