import type { Routes } from '@angular/router';
import type { SpaceNavItem } from '../layout/space-layout';

/** Items with an icon also go in the phone's bottom bar (five at most): assignments stay desktop-only. */
export const ADMIN_NAV: readonly SpaceNavItem[] = [
  { label: 'Utilisateurs', path: 'utilisateurs', icon: 'users' },
  { label: 'Classes', path: 'classes', icon: 'book' },
  { label: 'Affectations', path: 'affectations' },
  { label: 'Emploi du temps', path: 'emploi-du-temps' },
  { label: 'Validations', path: 'validations' },
  { label: 'Années et trimestres', path: 'annees', icon: 'calendar', short: 'Années' },
  { label: 'Bulletins', path: 'bulletins', icon: 'printer' },
  { label: 'Messages', path: 'messages', icon: 'mail' },
];

/** The administration (/admin). Pages are ported from design/prototypes/admin-*.html. */
export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'utilisateurs' },
  {
    path: 'utilisateurs',
    title: 'Utilisateurs',
    loadComponent: () => import('./utilisateurs/users-page').then((m) => m.UsersPage),
  },
  {
    path: 'classes',
    title: 'Classes',
    loadComponent: () => import('./classes/classes-page').then((m) => m.ClassesPage),
  },
  {
    path: 'classes/:id',
    title: 'Classe',
    loadComponent: () => import('./classes/class-detail-page').then((m) => m.ClassDetailPage),
  },
  {
    path: 'affectations',
    title: 'Affectations',
    loadComponent: () => import('./affectations/assignments-page').then((m) => m.AssignmentsPage),
  },
  {
    path: 'emploi-du-temps',
    title: 'Emploi du temps',
    loadComponent: () =>
      import('./emploi-du-temps/timetable-editor-page').then((m) => m.TimetableEditorPage),
  },
  {
    path: 'annees',
    title: 'Années et trimestres',
    loadComponent: () => import('./annees/years-page').then((m) => m.YearsPage),
  },
  {
    path: 'bulletins',
    title: 'Bulletins',
    loadComponent: () => import('./bulletins/report-cards-page').then((m) => m.ReportCardsPage),
  },
  {
    path: 'validations',
    title: 'Validations',
    loadComponent: () => import('./validations/validations-page').then((m) => m.ValidationsPage),
  },
  {
    path: 'messages',
    title: 'Messages',
    loadComponent: () => import('./messages/messages-page').then((m) => m.MessagesPage),
  },
];
