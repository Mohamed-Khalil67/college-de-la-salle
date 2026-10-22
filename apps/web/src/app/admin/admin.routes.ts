import { inject } from '@angular/core';
import type { Routes } from '@angular/router';
import { adminOnlyGuard, COORDINATOR_HOME } from '../core/auth/auth.guards';
import { AuthStore } from '../core/auth/auth-store';

/** The administration (/admin). Pages are ported from design/prototypes/admin-*.html. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: () => (inject(AuthStore).role() === 'admin' ? 'utilisateurs' : COORDINATOR_HOME.replace('/admin/', '')),
  },
  // Structure screens: the admin and the coordinators.
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
    path: 'matieres',
    title: 'Matières',
    loadComponent: () => import('./matieres/subjects-page').then((m) => m.SubjectsPage),
  },
  {
    path: 'salles',
    title: 'Salles',
    loadComponent: () => import('./salles/rooms-page').then((m) => m.RoomsPage),
  },
  {
    path: 'types-activite',
    title: 'Types d’activité',
    loadComponent: () => import('./types-activite/activity-types-page').then((m) => m.ActivityTypesPage),
  },
  {
    path: 'groupes',
    title: 'Groupes',
    loadComponent: () => import('../groupes/groups-page').then((m) => m.GroupsPage),
  },
  {
    path: 'emploi-du-temps',
    title: 'Emploi du temps',
    loadComponent: () =>
      import('./emploi-du-temps/timetable-editor-page').then((m) => m.TimetableEditorPage),
  },
  {
    path: 'annees',
    title: 'Année scolaire',
    loadComponent: () => import('./annees/school-year-page').then((m) => m.SchoolYearPage),
  },
  {
    path: 'menu',
    title: 'Toutes les pages',
    loadComponent: () => import('../layout/menu-page').then((m) => m.MenuPage),
  },
  // The admin's alone: a coordinator is sent back to the structure screens.
  {
    path: 'utilisateurs',
    title: 'Utilisateurs',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./utilisateurs/users-page').then((m) => m.UsersPage),
  },
  {
    path: 'affectations',
    title: 'Affectations',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./affectations/assignments-page').then((m) => m.AssignmentsPage),
  },
  {
    path: 'bulletins',
    title: 'Bulletins',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./bulletins/report-cards-page').then((m) => m.ReportCardsPage),
  },
  {
    path: 'validations',
    title: 'Validations',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./validations/validations-page').then((m) => m.ValidationsPage),
  },
  {
    path: 'nouvelle-annee',
    title: 'Nouvelle année',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./nouvelle-annee/new-year-page').then((m) => m.NewYearPage),
  },
  {
    path: 'messages',
    title: 'Messages',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./messages/messages-page').then((m) => m.MessagesPage),
  },
];
