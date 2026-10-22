import type { SpaceNavItem } from './space-nav';

/**
 * The navigation of the three spaces, in one decorator-free file (the layout, the « Plus » page and the
 * routes read it; `space-nav.spec.ts` checks what each role sees).
 */

/**
 * Phone bottom bar (five at most): Accueil, Horaire, Devoirs, Notes, Plus. Examens et devoirs (the events
 * calendar), Absences and Bulletins are in « Plus ».
 */
export const ELEVE_NAV: readonly SpaceNavItem[] = [
  { label: 'Tableau de bord', path: '', icon: 'home', short: 'Accueil' },
  { label: 'Emploi du temps', path: 'emploi-du-temps', icon: 'clock', short: 'Horaire' },
  { label: 'Examens et devoirs', path: 'agenda', short: 'Agenda' },
  { label: 'Devoirs', path: 'devoirs', icon: 'book' },
  { label: 'Notes', path: 'notes', icon: 'file-text' },
  { label: 'Absences', path: 'absences' },
  { label: 'Bulletins', path: 'bulletins' },
  { label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true },
];

/**
 * Phone bottom bar (five at most): Classes, Horaire, Notes, Appel, Plus. Agenda, Groupes, Annonces and, for a
 * coordinator, Coordination are one tap away in « Plus ».
 */
export const ENSEIGNANT_NAV: readonly SpaceNavItem[] = [
  { label: 'Mes classes', path: '', icon: 'users', short: 'Classes' },
  { label: 'Mon emploi du temps', path: 'emploi-du-temps', icon: 'clock', short: 'Horaire' },
  { label: 'Agenda', path: 'agenda' },
  { label: 'Saisie des notes', path: 'notes', icon: 'edit', short: 'Notes' },
  { label: 'Appel', path: 'appel', icon: 'check' },
  { label: 'Groupes', path: 'groupes' },
  { label: 'Annonces', path: 'annonces' },
  /** Teachers the admin marked coordinateur edit the year's structure in the administration area. */
  { label: 'Coordination', path: 'coordination', href: '/admin/matieres', access: 'coordinator' },
  { label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true },
];

/**
 * Navigation of /admin. Entries without `access` are the structure screens: the admin and the coordinators
 * (teachers marked coordinateur) open them. `access: 'admin'` ones are the admin's alone. Items with an icon
 * go in the phone's bottom bar (five at most); « Plus » lists every screen there.
 */
export const ADMIN_NAV: readonly SpaceNavItem[] = [
  { label: 'Utilisateurs', path: 'utilisateurs', icon: 'users', access: 'admin' },
  { label: 'Classes', path: 'classes', icon: 'book' },
  { label: 'Emploi du temps', path: 'emploi-du-temps', icon: 'clock', short: 'Horaire' },
  { label: 'Matières', path: 'matieres' },
  { label: 'Groupes', path: 'groupes', secondary: true },
  { label: 'Salles', path: 'salles', secondary: true },
  { label: 'Types d’activité', path: 'types-activite', short: 'Types', secondary: true },
  { label: 'Année scolaire', path: 'annees', icon: 'calendar', short: 'Année' },
  { label: 'Nouvelle année', path: 'nouvelle-annee', access: 'admin', secondary: true },
  { label: 'Affectations', path: 'affectations', access: 'admin' },
  { label: 'Validations', path: 'validations', access: 'admin' },
  { label: 'Bulletins', path: 'bulletins', access: 'admin' },
  { label: 'Messages', path: 'messages', access: 'admin', secondary: true },
  /** A coordinator also teaches: the way back to the teacher space. */
  { label: 'Mon espace enseignant', path: 'enseignant', href: '/enseignant', access: 'coordinator', secondary: true },
  { label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true },
];
