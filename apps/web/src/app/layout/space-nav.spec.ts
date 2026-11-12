import { describe, expect, it } from 'vitest';
import { desktopNav, mobileNav, type SpaceNavItem, visibleNav } from './space-nav';
import { ADMIN_NAV, ELEVE_NAV, ENSEIGNANT_NAV } from './space-navs';

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

describe('the phone bottom bar', () => {
  it('shows five items at most, « Plus » last, for every role', () => {
    const cases: [string, readonly SpaceNavItem[], Who, string[]][] = [
      ['student', ELEVE_NAV, student, ['Accueil', 'Horaire', 'Devoirs', 'Notes', 'Plus']],
      ['teacher', ENSEIGNANT_NAV, teacher, ['Classes', 'Horaire', 'Notes', 'Appel', 'Plus']],
      ['planner, teacher space', ENSEIGNANT_NAV, planner, ['Classes', 'Horaire', 'Notes', 'Appel', 'Plus']],
      ['admin', ADMIN_NAV, admin, ['Utilisateurs', 'Classes', 'Horaire', 'Année', 'Plus']],
      ['planner, administration', ADMIN_NAV, planner, ['Classes', 'Horaire', 'Année', 'Plus']],
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

describe('« Plus » lists every screen of the area', () => {
  it('has the pages that are not in the bar', () => {
    expect(labels(menu(ELEVE_NAV, student))).toEqual(
      expect.arrayContaining(['Agenda', 'Absences', 'Bulletins', 'Notifications', 'Agenda en ligne']),
    );
    expect(labels(menu(ENSEIGNANT_NAV, teacher))).toEqual(
      expect.arrayContaining(['Notifications', 'Agenda en ligne']),
    );
    // Notifications and the agenda link belong to students and teachers: the administration has neither.
    expect(ADMIN_NAV.map((i) => i.path)).not.toContain('notifications');
    expect(labels(menu(ENSEIGNANT_NAV, teacher))).toEqual(expect.arrayContaining(['Agenda', 'Groupes', 'Annonces']));
    expect(menu(ENSEIGNANT_NAV, teacher).map((i) => i.label)).not.toContain('Planification');
    expect(menu(ENSEIGNANT_NAV, planner).map((i) => i.label)).toContain('Planification');
    const adminPages = menu(ADMIN_NAV, admin).map((i) => i.label);
    expect(adminPages).toEqual(
      expect.arrayContaining(['Matières', 'Groupes', 'Salles', 'Types d’activité', 'Nouvelle année', 'Affectations', 'Validations', 'Bulletins', 'Messages']),
    );
    const plannerPages = menu(ADMIN_NAV, planner).map((i) => i.label);
    expect(plannerPages).toEqual(
      expect.arrayContaining(['Matières', 'Groupes', 'Salles', 'Types d’activité', 'Année scolaire', 'Mon espace enseignant']),
    );
    expect(plannerPages).not.toContain('Utilisateurs');
    expect(plannerPages).not.toContain('Nouvelle année');
    expect(plannerPages).not.toContain('Bulletins');
  });

  it('every area reaches its own « Plus » page', () => {
    for (const [nav, who] of [[ELEVE_NAV, student], [ENSEIGNANT_NAV, teacher], [ADMIN_NAV, admin]] as const) {
      expect(visibleNav(nav, who).some((i) => i.path === 'menu' && i.mobileOnly)).toBe(true);
    }
  });
});

describe('the top navigation', () => {
  it('shows everything when it fits, and the overflow moves to « Plus » when it does not', () => {
    expect(labels(desktopNav(visibleNav(ELEVE_NAV, student)))).toContain('Absences');
    expect(desktopNav(visibleNav(ENSEIGNANT_NAV, planner)).map((i) => i.label)).toContain('Planification');
    const adminTop = desktopNav(visibleNav(ADMIN_NAV, admin)).map((i) => i.label);
    expect(adminTop).toContain('Plus');
    expect(adminTop).not.toContain('Salles');
    // The rollover is run once a year: it sits behind « Plus » in the top bar.
    expect(adminTop).not.toContain('Nouvelle année');
    expect(adminTop.length).toBeLessThanOrEqual(10);
    const plannerTop = desktopNav(visibleNav(ADMIN_NAV, planner)).map((i) => i.label);
    // The planner's own page comes first; the rarer structure screens move behind « Plus ».
    expect(plannerTop.slice(0, 2)).toEqual(['Planification', 'Classes']);
    expect(plannerTop).not.toContain('Salles');
    expect(plannerTop).toContain('Plus');
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
