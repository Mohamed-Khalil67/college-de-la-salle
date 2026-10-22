import type { Routes } from '@angular/router';

/** The student space (/eleve). Pages are ported from design/prototypes/eleve-*.html. */
export const ELEVE_ROUTES: Routes = [
  {
    path: '',
    title: 'Tableau de bord',
    loadComponent: () => import('./tableau-de-bord/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'emploi-du-temps',
    title: 'Emploi du temps',
    loadComponent: () =>
      import('./emploi-du-temps/student-timetable-page').then((m) => m.StudentTimetablePage),
  },
  {
    // The calendar of events: exams, tests, homework deadlines and one-off activities.
    path: 'agenda',
    title: 'Examens et devoirs',
    loadComponent: () => import('./emploi-du-temps/timetable-page').then((m) => m.TimetablePage),
  },
  {
    path: 'devoirs',
    title: 'Devoirs',
    loadComponent: () => import('./devoirs/homework-page').then((m) => m.HomeworkPage),
  },
  {
    path: 'notes',
    title: 'Notes',
    loadComponent: () => import('./notes/grades-page').then((m) => m.GradesPage),
  },
  {
    path: 'absences',
    title: 'Absences',
    loadComponent: () => import('./absences/absences-page').then((m) => m.AbsencesPage),
  },
  {
    path: 'section',
    title: 'Ma section',
    loadComponent: () => import('./section/section-page').then((m) => m.SectionPage),
  },
  {
    path: 'bulletins',
    title: 'Bulletins',
    loadComponent: () => import('./bulletins/report-cards-page').then((m) => m.ReportCardsPage),
  },
  {
    path: 'menu',
    title: 'Toutes les pages',
    loadComponent: () => import('../layout/menu-page').then((m) => m.MenuPage),
  },
];
