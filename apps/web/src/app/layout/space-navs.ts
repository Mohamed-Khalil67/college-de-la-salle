import type { SpaceNavItem } from './space-nav';

/**
 * The navigation of the three spaces, in one decorator-free file (the layout, the « Plus » page and the
 * routes read it; `space-nav.spec.ts` checks what each role sees).
 *
 * Every role has one page of blocks and the same shape of menu: « Accueil » first (that page), then the few
 * destinations used every day that no block button leads to, then the rare ones behind « Plus ». Every other
 * detail page is reached from a block's entry button and listed in the `*_DETAILS` arrays below (not in the menu,
 * but routed, and opened by the all-screens Playwright spec). Nothing is removed from the routing.
 */

/**
 * Phone bottom bar: Accueil, Horaire, Devoirs, Plus. Notes, Absences, Bulletins, Annonces and Agenda (exams and
 * homework) are reached from the blocks of the home page.
 */
export const ELEVE_NAV: readonly SpaceNavItem[] = [
  { label: 'Accueil', path: '', icon: 'home' },
  { label: 'Emploi du temps', path: 'emploi-du-temps', icon: 'clock', short: 'Horaire' },
  { label: 'Devoirs', path: 'devoirs', icon: 'book' },
  { label: 'Notifications', path: 'notifications', secondary: true },
  { label: 'Synchroniser mon agenda', path: 'synchroniser', short: 'Agenda en ligne', secondary: true },
  { label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true },
];

/** Student pages a block of « Accueil » opens, and « Ma section » (the account menu). Labels as the page's own heading. */
export const ELEVE_DETAILS: readonly SpaceNavItem[] = [
  { label: 'Examens et devoirs', path: 'agenda' },
  { label: 'Notes', path: 'notes' },
  { label: 'Absences', path: 'absences' },
  { label: 'Bulletins', path: 'bulletins' },
  { label: 'Ma section', path: 'section' },
  { label: 'Annonces', path: 'annonces' },
];

/**
 * Phone bottom bar: Accueil, Horaire, Appel, Plus. « Noter », Mes classes, Agenda and Annonces are reached from
 * the home page's blocks; Groupes, Notifications and the agenda link are in « Plus », and Planification for a planner.
 */
export const ENSEIGNANT_NAV: readonly SpaceNavItem[] = [
  { label: 'Accueil', path: '', icon: 'home' },
  { label: 'Mon emploi du temps', path: 'emploi-du-temps', icon: 'clock', short: 'Horaire' },
  { label: 'Appel', path: 'appel', icon: 'check' },
  { label: 'Groupes', path: 'groupes' },
  { label: 'Notifications', path: 'notifications', secondary: true },
  { label: 'Synchroniser mon agenda', path: 'synchroniser', short: 'Agenda en ligne', secondary: true },
  /** Teachers the admin marked planificateur edit the year's structure in the administration area. */
  { label: 'Planification', path: 'planification', href: '/admin/planification', access: 'planner' },
  { label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true },
];

/** Teacher pages a block of « Accueil » opens. */
export const ENSEIGNANT_DETAILS: readonly SpaceNavItem[] = [
  { label: 'Mes classes', path: 'classes' },
  { label: 'Agenda', path: 'agenda' },
  { label: 'Saisie des notes', path: 'notes' },
  { label: 'Noter', path: 'noter' },
  { label: 'Annonces', path: 'annonces' },
];

/**
 * Navigation of /admin, for two kinds of people. The admin lands on « Accueil » (`/admin`, the administration's
 * page); a planner (a teacher marked planificateur) has « Accueil » = Planification (`/admin/planification`) and no
 * second entry for it. Entries without `access` are the structure screens both open. Items with an icon go in the
 * phone's bottom bar (five at most: the admin's is Accueil, Planification, Classes, Horaire, Plus; the planner's
 * has one less); « Plus » lists every screen there.
 */
export const ADMIN_NAV: readonly SpaceNavItem[] = [
  { label: 'Accueil', path: '', icon: 'home', access: 'admin' },
  /** The planner's one page: their « Accueil ». */
  { label: 'Accueil', path: 'planification', icon: 'home', access: 'planner' },
  /** For the admin it is a screen of its own, next to their page. */
  { label: 'Planification', path: 'planification', icon: 'calendar', short: 'Planif.', access: 'admin' },
  { label: 'Classes', path: 'classes', icon: 'book' },
  { label: 'Emploi du temps', path: 'emploi-du-temps', icon: 'clock', short: 'Horaire' },
  { label: 'Affectations', path: 'affectations', access: 'admin' },
  { label: 'Matières', path: 'matieres', secondary: true },
  { label: 'Groupes', path: 'groupes', secondary: true },
  { label: 'Salles', path: 'salles', secondary: true },
  { label: 'Types d’activité', path: 'types-activite', short: 'Types', secondary: true },
  { label: 'Année scolaire', path: 'annees', short: 'Année', secondary: true },
  /** A planner also teaches: the way back to the teacher space. */
  { label: 'Mon espace enseignant', path: 'enseignant', href: '/enseignant', access: 'planner', secondary: true },
  { label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true },
];

/** Administration pages a block of the admin's « Accueil » (or the planner's) opens. */
export const ADMIN_DETAILS: readonly SpaceNavItem[] = [
  { label: 'Utilisateurs', path: 'utilisateurs', access: 'admin' },
  { label: 'Validations', path: 'validations', access: 'admin' },
  { label: 'Préparer les bulletins', path: 'bulletins/preparation', access: 'admin' },
  { label: 'Bulletins', path: 'bulletins', access: 'admin' },
  { label: 'Annonces', path: 'annonces', access: 'admin' },
  { label: 'Messages', path: 'messages', access: 'admin' },
  { label: 'Nouvelle année', path: 'nouvelle-annee', access: 'admin' },
  { label: 'Professeur absent', path: 'planification/professeur-absent' },
];
