import type { Routes } from '@angular/router';
import type { SpaceNavItem } from '../layout/space-layout';

export const ENSEIGNANT_NAV: readonly SpaceNavItem[] = [
  { label: 'Mes classes', path: '', icon: 'users', short: 'Classes' },
  { label: 'Agenda', path: 'agenda', icon: 'calendar' },
  { label: 'Saisie des notes', path: 'notes', icon: 'edit', short: 'Notes' },
  { label: 'Appel', path: 'appel', icon: 'check' },
  { label: 'Annonces', path: 'annonces', icon: 'bell' },
  /** Teachers the admin marked coordinateur edit the year's structure in the administration area. */
  { label: 'Coordination', path: 'coordination', href: '/admin/matieres', icon: 'book', access: 'coordinator' },
];

/** The teacher space (/enseignant). Pages are ported from design/prototypes/enseignant-*.html. */
export const ENSEIGNANT_ROUTES: Routes = [
  {
    path: '',
    title: 'Mes classes',
    loadComponent: () => import('./mes-classes/classes-page').then((m) => m.ClassesPage),
  },
  {
    path: 'agenda',
    title: 'Agenda',
    loadComponent: () => import('./agenda/agenda-page').then((m) => m.AgendaPage),
  },
  {
    path: 'notes',
    title: 'Saisie des notes',
    loadComponent: () => import('./notes/grade-entry-page').then((m) => m.GradeEntryPage),
  },
  {
    path: 'appel',
    title: 'Appel',
    loadComponent: () => import('./appel/attendance-page').then((m) => m.AttendancePage),
  },
  {
    path: 'annonces',
    title: 'Annonces',
    loadComponent: () => import('./annonces/posts-page').then((m) => m.PostsPage),
  },
];
