import type { Routes } from '@angular/router';
import type { SpaceNavItem } from '../layout/space-layout';

/**
 * Phone bottom bar (five at most): Classes, Horaire, Notes, Appel, Plus. Agenda, Annonces and, for a coordinator,
 * Coordination are one tap away in « Plus ».
 */
export const ENSEIGNANT_NAV: readonly SpaceNavItem[] = [
  { label: 'Mes classes', path: '', icon: 'users', short: 'Classes' },
  { label: 'Mon emploi du temps', path: 'emploi-du-temps', icon: 'clock', short: 'Horaire' },
  { label: 'Agenda', path: 'agenda' },
  { label: 'Saisie des notes', path: 'notes', icon: 'edit', short: 'Notes' },
  { label: 'Appel', path: 'appel', icon: 'check' },
  { label: 'Annonces', path: 'annonces' },
  /** Teachers the admin marked coordinateur edit the year's structure in the administration area. */
  { label: 'Coordination', path: 'coordination', href: '/admin/matieres', access: 'coordinator' },
  { label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true },
];

/** The teacher space (/enseignant). Pages are ported from design/prototypes/enseignant-*.html. */
export const ENSEIGNANT_ROUTES: Routes = [
  {
    path: '',
    title: 'Mes classes',
    loadComponent: () => import('./mes-classes/classes-page').then((m) => m.ClassesPage),
  },
  {
    path: 'emploi-du-temps',
    title: 'Mon emploi du temps',
    loadComponent: () =>
      import('./emploi-du-temps/my-timetable-page').then((m) => m.MyTimetablePage),
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
  {
    path: 'menu',
    title: 'Toutes les pages',
    loadComponent: () => import('../layout/menu-page').then((m) => m.MenuPage),
  },
];
