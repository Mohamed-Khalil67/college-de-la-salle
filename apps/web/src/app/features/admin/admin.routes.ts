import type { Routes } from '@angular/router';
import { adminOnlyGuard } from '../../core/auth/auth.guards';

/** The administration (/admin). Pages are ported from design/prototypes/admin-*.html. */
export const ADMIN_ROUTES: Routes = [
  // The administration's one page (docs/workflow-redesign.md). A planner is sent back to the structure screens.
  {
    path: '',
    pathMatch: 'full',
    title: 'Administration',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./accueil/home-page').then((m) => m.AdminHomePage),
  },
  // Structure screens: the admin and the planners.
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
    loadComponent: () => import('../../layout/menu-page').then((m) => m.MenuPage),
  },
  // The admin's alone: a planner is sent back to the structure screens.
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
    path: 'bulletins/preparation',
    title: 'Préparer les bulletins',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./bulletins/report-preparation-page').then((m) => m.ReportPreparationPage),
  },
  {
    path: 'annonces',
    title: 'Annonces',
    canMatch: [adminOnlyGuard],
    loadComponent: () => import('./annonces/announcements-page').then((m) => m.AnnouncementsPage),
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
