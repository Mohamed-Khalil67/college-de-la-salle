import type { Routes } from '@angular/router';
import type { SpaceNavItem } from '../layout/space-layout';

export const ELEVE_NAV: readonly SpaceNavItem[] = [
  { label: 'Tableau de bord', path: '', icon: 'home', short: 'Accueil' },
  { label: 'Emploi du temps', path: 'emploi-du-temps', icon: 'calendar', short: 'Agenda' },
  { label: 'Devoirs', path: 'devoirs', icon: 'book' },
  { label: 'Notes', path: 'notes', icon: 'file-text' },
  { label: 'Absences', path: 'absences' },
  { label: 'Bulletins', path: 'bulletins', icon: 'printer' },
];

const placeholder = () => import('../layout/page-placeholder').then((m) => m.PagePlaceholder);

/** The student space (/eleve). Pages are ported from design/prototypes/eleve-*.html. */
export const ELEVE_ROUTES: Routes = [
  { path: '', title: 'Tableau de bord', loadComponent: placeholder },
  { path: 'emploi-du-temps', title: 'Emploi du temps', loadComponent: placeholder },
  { path: 'devoirs', title: 'Devoirs', loadComponent: placeholder },
  { path: 'notes', title: 'Notes', loadComponent: placeholder },
  { path: 'absences', title: 'Absences', loadComponent: placeholder },
  { path: 'bulletins', title: 'Bulletins', loadComponent: placeholder },
];
