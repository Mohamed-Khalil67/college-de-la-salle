import { inject } from '@angular/core';
import type { Routes } from '@angular/router';
import { adminOnlyGuard, COORDINATOR_HOME } from '../core/auth/auth.guards';
import { AuthStore } from '../core/auth/auth-store';
import type { SpaceNavItem } from '../layout/space-layout';

/**
 * Navigation of /admin. Entries without `access` are the structure screens: the admin and the coordinators
 * (teachers marked coordinateur) open them. `access: 'admin'` ones are the admin's alone. Items with an icon
 * go in the phone's bottom bar (five at most); « Plus » lists every screen there.
 */
export const ADMIN_NAV: readonly SpaceNavItem[] = [
  { label: 'Utilisateurs', path: 'utilisateurs', icon: 'users', access: 'admin' },
  { label: 'Classes', path: 'classes', icon: 'book' },
  { label: 'Matières', path: 'matieres' },
  { label: 'Salles', path: 'salles' },
  { label: 'Types d’activité', path: 'types-activite', short: 'Types' },
  { label: 'Année scolaire', path: 'annees', icon: 'calendar', short: 'Année' },
  { label: 'Affectations', path: 'affectations', access: 'admin' },
  { label: 'Validations', path: 'validations', access: 'admin' },
  { label: 'Bulletins', path: 'bulletins', icon: 'printer', access: 'admin' },
  { label: 'Messages', path: 'messages', access: 'admin' },
  { label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true },
];

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
    path: 'annees',
    title: 'Année scolaire',
    loadComponent: () => import('./annees/school-year-page').then((m) => m.SchoolYearPage),
  },
  {
    path: 'menu',
    title: 'Toutes les pages',
    loadComponent: () => import('./menu/menu-page').then((m) => m.MenuPage),
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
    path: 'messages',
    title: 'Messages',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./messages/messages-page').then((m) => m.MessagesPage),
  },
];
