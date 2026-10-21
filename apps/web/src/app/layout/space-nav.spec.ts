import { describe, expect, it } from 'vitest';
import { desktopNav, mobileNav, type SpaceNavItem, visibleNav } from './space-nav';
import { ADMIN_NAV, ELEVE_NAV, ENSEIGNANT_NAV } from './space-navs';

type Who = { role: 'student' | 'teacher' | 'admin'; isCoordinator: boolean };
const student: Who = { role: 'student', isCoordinator: false };
const teacher: Who = { role: 'teacher', isCoordinator: false };
const coordinator: Who = { role: 'teacher', isCoordinator: true };
const admin: Who = { role: 'admin', isCoordinator: false };

const labels = (items: readonly SpaceNavItem[]) => items.map((i) => i.short ?? i.label);
/** What `MenuPage` lists (« Plus »). */
const menu = (nav: readonly SpaceNavItem[], who: Who) => visibleNav(nav, who).filter((i) => !i.mobileOnly);

describe('the phone bottom bar', () => {
  it('shows five items at most, « Plus » last, for every role', () => {
    const cases: [string, readonly SpaceNavItem[], Who, string[]][] = [
      ['student', ELEVE_NAV, student, ['Accueil', 'Horaire', 'Devoirs', 'Notes', 'Plus']],
      ['teacher', ENSEIGNANT_NAV, teacher, ['Classes', 'Horaire', 'Notes', 'Appel', 'Plus']],
      ['coordinator, teacher space', ENSEIGNANT_NAV, coordinator, ['Classes', 'Horaire', 'Notes', 'Appel', 'Plus']],
      ['admin', ADMIN_NAV, admin, ['Utilisateurs', 'Classes', 'Horaire', 'Année', 'Plus']],
      ['coordinator, administration', ADMIN_NAV, coordinator, ['Classes', 'Horaire', 'Année', 'Plus']],
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
      expect.arrayContaining(['Agenda', 'Absences', 'Bulletins']),
    );
    expect(labels(menu(ENSEIGNANT_NAV, teacher))).toEqual(expect.arrayContaining(['Agenda', 'Groupes', 'Annonces']));
    expect(menu(ENSEIGNANT_NAV, teacher).map((i) => i.label)).not.toContain('Coordination');
    expect(menu(ENSEIGNANT_NAV, coordinator).map((i) => i.label)).toContain('Coordination');
    const adminPages = menu(ADMIN_NAV, admin).map((i) => i.label);
    expect(adminPages).toEqual(
      expect.arrayContaining(['Matières', 'Groupes', 'Salles', 'Types d’activité', 'Affectations', 'Validations', 'Bulletins', 'Messages']),
    );
    const coordinatorPages = menu(ADMIN_NAV, coordinator).map((i) => i.label);
    expect(coordinatorPages).toEqual(
      expect.arrayContaining(['Matières', 'Groupes', 'Salles', 'Types d’activité', 'Année scolaire', 'Mon espace enseignant']),
    );
    expect(coordinatorPages).not.toContain('Utilisateurs');
    expect(coordinatorPages).not.toContain('Bulletins');
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
    expect(desktopNav(visibleNav(ENSEIGNANT_NAV, coordinator)).map((i) => i.label)).toContain('Coordination');
    const adminTop = desktopNav(visibleNav(ADMIN_NAV, admin)).map((i) => i.label);
    expect(adminTop).toContain('Plus');
    expect(adminTop).not.toContain('Salles');
    expect(adminTop.length).toBeLessThanOrEqual(9);
    const coordinatorTop = desktopNav(visibleNav(ADMIN_NAV, coordinator)).map((i) => i.label);
    expect(coordinatorTop).toEqual(expect.arrayContaining(['Salles', 'Types d’activité']));
    expect(coordinatorTop).not.toContain('Plus');
  });
});
