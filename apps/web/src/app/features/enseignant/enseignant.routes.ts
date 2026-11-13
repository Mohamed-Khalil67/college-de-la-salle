import type { Routes } from '@angular/router';

/** The teacher space (/enseignant). Pages are ported from design/prototypes/enseignant-*.html. */
export const ENSEIGNANT_ROUTES: Routes = [
  {
    path: '',
    // The one page: Mes cours aujourd’hui, Notes à finir, Devoirs donnés, À surveiller, Annonces.
    title: 'Accueil',
    loadComponent: () => import('./accueil/home-page').then((m) => m.TeacherHomePage),
  },
  {
    path: 'classes',
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
    path: 'noter',
    title: 'Noter',
    loadComponent: () => import('./noter/noter-page').then((m) => m.NoterPage),
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
    path: 'synchroniser',
    title: 'Synchroniser mon agenda',
    loadComponent: () => import('../agenda-sync/agenda-sync-page').then((m) => m.AgendaSyncPage),
  },
  {
    path: 'notifications',
    title: 'Notifications',
    loadComponent: () =>
      import('../notifications/notifications-page').then((m) => m.NotificationsPage),
  },
  {
    path: 'menu',
    title: 'Toutes les pages',
    loadComponent: () => import('../../layout/menu-page').then((m) => m.MenuPage),
  },
];
