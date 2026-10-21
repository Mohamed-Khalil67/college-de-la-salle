import type { Routes } from '@angular/router';

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
    path: 'groupes',
    title: 'Groupes',
    loadComponent: () => import('../groupes/groups-page').then((m) => m.GroupsPage),
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
