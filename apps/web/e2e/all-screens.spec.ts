import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, type Account } from './accounts';
import { axeAtBothWidths, goInApp, signInAs } from './structure';
import { ADMIN_NAV, ELEVE_NAV, ENSEIGNANT_NAV } from '../src/app/layout/space-navs';
import { mobileNav, type SpaceNavItem, visibleNav } from '../src/app/layout/space-nav';

/**
 * Every screen of every space, once: it opens without a console error, has one h1, and passes Axe at 390 and
 * 1440 px; and the phone's bottom bar and « Plus » page list what the navigation model says for each role.
 * The screens come from the navigation model itself, so a new entry is covered the day it is added.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at both widths inside each test');
});

interface Who {
  readonly title: string;
  readonly account: Account;
  readonly user: { role: 'student' | 'teacher' | 'admin'; isCoordinator: boolean };
  readonly area: string;
  readonly nav: readonly SpaceNavItem[];
}

const ROLES: Who[] = [
  { title: 'admin', account: ACCOUNTS.admin, user: { role: 'admin', isCoordinator: false }, area: '/admin', nav: ADMIN_NAV },
  { title: 'coordinator (administration)', account: ACCOUNTS.coordinator, user: { role: 'teacher', isCoordinator: true }, area: '/admin', nav: ADMIN_NAV },
  { title: 'coordinator (teacher space)', account: ACCOUNTS.coordinator, user: { role: 'teacher', isCoordinator: true }, area: '/enseignant', nav: ENSEIGNANT_NAV },
  { title: 'teacher', account: ACCOUNTS.teacher, user: { role: 'teacher', isCoordinator: false }, area: '/enseignant', nav: ENSEIGNANT_NAV },
  { title: 'student', account: ACCOUNTS.student, user: { role: 'student', isCoordinator: false }, area: '/eleve', nav: ELEVE_NAV },
];

/** The screens of the area for this role: not the links to other areas, « Plus » included (the shared menu page). */
const screens = (who: Who) =>
  visibleNav(who.nav, who.user)
    .filter((i) => !i.href)
    .map((i) => ({ label: i.label, path: `${who.area}${i.path ? `/${i.path}` : ''}` }));

async function watchConsole(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

for (const who of ROLES) {
  test(`${who.title}: every screen opens cleanly and passes Axe at 390 and 1440 px`, async ({ page }) => {
    test.setTimeout(240_000);
    // The 401 of the session check before sign-in is expected; errors are counted from the moment the space opens.
    await signInAs(page, who.account);
    const errors = await watchConsole(page);
    const seen: string[] = [];
    for (const screen of screens(who)) {
      await goInApp(page, screen.path);
      await expect(page.getByRole('heading', { level: 1 }), screen.label).toHaveCount(1);
      await expect(page.locator('.loading-line'), `${screen.label} finished loading`).toHaveCount(0, { timeout: 30_000 });
      await axeAtBothWidths(page);
      seen.push(screen.label);
    }
    // A class page (the admin and the teachers open one from their lists).
    if (who.area === '/admin') {
      await goInApp(page, '/admin/classes');
      await page.getByRole('link', { name: /Terminale|Première|Seconde/ }).first().click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
      await axeAtBothWidths(page);
    }
    expect(seen.length).toBeGreaterThan(3);
    expect(errors, 'console errors').toEqual([]);
  });

  test(`${who.title}: the phone bar and « Plus » follow the navigation model`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, who.account);
    await goInApp(page, who.area === '/admin' ? '/admin/classes' : who.area === '/eleve' ? '/eleve' : '/enseignant');
    const visible = visibleNav(who.nav, who.user);
    const bar = page.getByRole('navigation', { name: 'Navigation mobile' });
    await expect(bar.getByRole('link')).toHaveText(mobileNav(visible).map((i) => i.short ?? i.label));
    await bar.getByRole('link', { name: 'Plus' }).click();
    await expect(page).toHaveURL(new RegExp(`${who.area}/menu$`));
    const main = page.getByRole('main');
    for (const item of visible.filter((i) => !i.mobileOnly))
      await expect(main.getByRole('link', { name: item.label, exact: true }), `« Plus » lists ${item.label}`).toBeVisible();
    await axeAtBothWidths(page);
  });
}
