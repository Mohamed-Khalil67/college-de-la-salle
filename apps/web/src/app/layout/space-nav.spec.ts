import { describe, expect, it } from 'vitest';
import { desktopNav, mobileNav, type SpaceNavItem, visibleNav } from './space-nav';
import { ADMIN_DETAILS, ADMIN_NAV, ELEVE_DETAILS, ELEVE_NAV, ENSEIGNANT_DETAILS, ENSEIGNANT_NAV } from './space-navs';

type Who = { role: 'student' | 'teacher' | 'admin'; isPlanner: boolean };
const student: Who = { role: 'student', isPlanner: false };
const teacher: Who = { role: 'teacher', isPlanner: false };
const planner: Who = { role: 'teacher', isPlanner: true };
const admin: Who = { role: 'admin', isPlanner: false };
/** Planificateur is a permission on the account: an admin may carry it too. */
const plannerAdmin: Who = { role: 'admin', isPlanner: true };

const labels = (items: readonly SpaceNavItem[]) => items.map((i) => i.short ?? i.label);
/** What `MenuPage` lists (« Plus »). */
const menu = (nav: readonly SpaceNavItem[], who: Who) => visibleNav(nav, who).filter((i) => !i.mobileOnly);

describe('every role opens on « Accueil »', () => {
  it('has it first in the menu and in the phone bar, with the same word for every role', () => {
    const cases: [string, readonly SpaceNavItem[], Who, string][] = [
      ['student', ELEVE_NAV, student, ''],
      ['teacher', ENSEIGNANT_NAV, teacher, ''],
      ['planner, teacher space', ENSEIGNANT_NAV, planner, ''],
      ['admin', ADMIN_NAV, admin, ''],
      // A planner's one page is Planification: it is their « Accueil », and there is no second entry for it.
      ['planner, administration', ADMIN_NAV, planner, 'planification'],
    ];
    for (const [name, nav, who, path] of cases) {
      const visible = visibleNav(nav, who);
      expect(visible[0], name).toMatchObject({ label: 'Accueil', path, icon: 'home' });
      expect(mobileNav(visible)[0], name).toBe(visible[0]);
      expect(visible.filter((i) => i.label === 'Accueil'), name).toHaveLength(1);
      expect(visible.filter((i) => i.path === path), name).toHaveLength(1);
    }
  });
});

describe('the phone bottom bar', () => {
  it('shows five items at most, « Plus » last, for every role', () => {
    const cases: [string, readonly SpaceNavItem[], Who, string[]][] = [
      ['student', ELEVE_NAV, student, ['Accueil', 'Horaire', 'Devoirs', 'Plus']],
      ['teacher', ENSEIGNANT_NAV, teacher, ['Accueil', 'Horaire', 'Appel', 'Plus']],
      ['planner, teacher space', ENSEIGNANT_NAV, planner, ['Accueil', 'Horaire', 'Appel', 'Plus']],
      ['admin', ADMIN_NAV, admin, ['Accueil', 'Planif.', 'Classes', 'Horaire', 'Plus']],
      ['planner, administration', ADMIN_NAV, planner, ['Accueil', 'Classes', 'Horaire', 'Plus']],
    ];
    for (const [, nav, who, expected] of cases) expect(labels(mobileNav(visibleNav(nav, who)))).toEqual(expected);
  });

  it('keeps « Plus » when there are too many icons', () => {
    const many: SpaceNavItem[] = [...'abcdef'].map((l) => ({ label: l, path: l, icon: 'home' as const }));
    many.push({ label: 'Plus', path: 'menu', icon: 'more', mobileOnly: true });
    const bar = mobileNav(many);
    expect(bar).toHaveLength(5);
    expect(bar.at(-1)?.label).toBe('Plus');
  });
});

describe('« Plus » lists every screen of the menu', () => {
  it('has the pages that are not in the bar', () => {
    expect(labels(menu(ELEVE_NAV, student))).toEqual(expect.arrayContaining(['Notifications', 'Agenda en ligne']));
    expect(labels(menu(ENSEIGNANT_NAV, teacher))).toEqual(expect.arrayContaining(['Groupes', 'Notifications', 'Agenda en ligne']));
    // Notifications and the agenda link belong to students and teachers: the administration has neither.
    expect(ADMIN_NAV.map((i) => i.path)).not.toContain('notifications');
    expect(menu(ENSEIGNANT_NAV, teacher).map((i) => i.label)).not.toContain('Planification');
    expect(menu(ENSEIGNANT_NAV, planner).map((i) => i.label)).toContain('Planification');
    expect(menu(ADMIN_NAV, admin).map((i) => i.label)).toEqual(
      expect.arrayContaining(['Planification', 'Affectations', 'Matières', 'Groupes', 'Salles', 'Types d’activité', 'Année scolaire']),
    );
    const plannerPages = menu(ADMIN_NAV, planner).map((i) => i.label);
    expect(plannerPages).toEqual(
      expect.arrayContaining(['Matières', 'Groupes', 'Salles', 'Types d’activité', 'Année scolaire', 'Mon espace enseignant']),
    );
    for (const adminOnly of ['Utilisateurs', 'Affectations', 'Planification']) expect(plannerPages).not.toContain(adminOnly);
  });

  it('every area reaches its own « Plus » page', () => {
    for (const [nav, who] of [[ELEVE_NAV, student], [ENSEIGNANT_NAV, teacher], [ADMIN_NAV, admin], [ADMIN_NAV, planner]] as const) {
      expect(visibleNav(nav, who).some((i) => i.path === 'menu' && i.mobileOnly)).toBe(true);
    }
  });
});

describe('the pages the blocks open', () => {
  it('are not in the menus (the block buttons reach them)', () => {
    for (const [nav, details] of [[ELEVE_NAV, ELEVE_DETAILS], [ENSEIGNANT_NAV, ENSEIGNANT_DETAILS], [ADMIN_NAV, ADMIN_DETAILS]] as const) {
      const inMenu = new Set(nav.map((i) => i.path));
      for (const page of details) expect(inMenu.has(page.path), page.path).toBe(false);
    }
    expect(ELEVE_DETAILS.map((i) => i.path)).toEqual(['agenda', 'notes', 'absences', 'bulletins', 'section', 'annonces']);
    expect(ENSEIGNANT_DETAILS.map((i) => i.path)).toContain('classes');
    expect(ADMIN_DETAILS.map((i) => i.path)).toEqual(
      expect.arrayContaining(['utilisateurs', 'validations', 'bulletins/preparation', 'messages']),
    );
  });
});

describe('the top navigation', () => {
  it('shows everything when it fits, and the overflow moves to « Plus » when it does not', () => {
    expect(labels(desktopNav(visibleNav(ELEVE_NAV, student)))).toEqual([
      'Accueil', 'Horaire', 'Devoirs', 'Notifications', 'Agenda en ligne',
    ]);
    expect(desktopNav(visibleNav(ENSEIGNANT_NAV, planner)).map((i) => i.label)).toEqual([
      'Accueil', 'Mon emploi du temps', 'Appel', 'Groupes', 'Notifications', 'Synchroniser mon agenda', 'Planification',
    ]);
    expect(desktopNav(visibleNav(ADMIN_NAV, admin)).map((i) => i.label)).toEqual([
      'Accueil', 'Planification', 'Classes', 'Emploi du temps', 'Affectations', 'Plus',
    ]);
    // The planner's own page comes first; the rarer structure screens move behind « Plus ».
    expect(desktopNav(visibleNav(ADMIN_NAV, planner)).map((i) => i.label)).toEqual([
      'Accueil', 'Classes', 'Emploi du temps', 'Plus',
    ]);
  });
});

describe('the Planificateur permission', () => {
  it('is labelled « Planification » in the teacher space, nowhere for a plain teacher or a student', () => {
    expect(ENSEIGNANT_NAV.find((i) => i.access === 'planner')).toMatchObject({ label: 'Planification', href: '/admin/planification' });
    expect(visibleNav(ENSEIGNANT_NAV, teacher).some((i) => i.access === 'planner')).toBe(false);
    // A student never holds it (the API and the database refuse it); the nav does not trust the flag either.
    expect(visibleNav(ELEVE_NAV, { role: 'student', isPlanner: true })).toEqual(visibleNav(ELEVE_NAV, student));
  });

  it('changes nothing for an admin account: the same administration, without the way to a teacher space', () => {
    expect(visibleNav(ADMIN_NAV, plannerAdmin)).toEqual(visibleNav(ADMIN_NAV, admin));
    expect(visibleNav(ADMIN_NAV, plannerAdmin).map((i) => i.label)).not.toContain('Mon espace enseignant');
  });
});
