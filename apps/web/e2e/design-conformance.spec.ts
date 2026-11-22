import type { TeacherSummaryDto, TeacherSummarySection } from '@cdls/shared';
import { expect, type Locator, type Page, type Route, test } from '@playwright/test';
import { ACCOUNTS, type Account } from './accounts';
import { axeAtBothWidths, goInApp, signInAs, unique } from './structure';

/**
 * Design conformance: the built UI against what the owner agreed (`docs/workflow-redesign.md`,
 * `docs/rollout.md` « What the student/teacher/administration sees » and « The menus »).
 *
 * One table per role (blocks in order, entry button and its route, header buttons, menus), then the same
 * generic checks for every role: failure isolation (one failing endpoint, the rest of the page usable, the entry
 * link still shown), empty and loading states, French copy, Axe (WCAG AA) at 390 and 1440 px, and a right-to-left
 * smoke (the spaces are French only; this proves the layout survives a mirrored document). Then Planificateur
 * routing, « Noter » and « Préparer les bulletins ». Test names start with a checklist id (S student, T teacher,
 * P planner, A admin, R routing, N Noter, B bulletins, X every home).
 *
 * Specs never edit product code: where the app does not yet match the agreement, the test is `test.fail()` with
 * the reason (it turns red, telling you to remove `fail`, the day the gap is closed). Widths are set inside the
 * tests, so the phone project is skipped.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside each test');
});

interface Block {
  readonly heading: string;
  /** The entry button's name and where it goes. */
  readonly link: string;
  readonly path: string;
  readonly h1: string | RegExp;
  readonly wide?: boolean;
  /** An endpoint that only this block (and `shares`) reads: failing it must fail this block alone. */
  readonly failing: string;
  /** The teacher's page reads one summary: this section of it failing (`failed`) must fail this block alone. */
  readonly section?: TeacherSummarySection;
  /** Other blocks that read the same source and fail with it. */
  readonly shares?: readonly string[];
  /** What the block says when it has nothing to show: an invitation, not an apology. */
  readonly empty: string | RegExp;
}

interface Menu {
  /** Top bar at 1440 px (the overflow behind « Plus » when there are more than eight). */
  readonly desktop: readonly string[];
  /** Bottom bar at 390 px: five at most, « Plus » last. */
  readonly phone: readonly string[];
  /** The « Plus » page: the whole menu. */
  readonly plus: readonly string[];
}

interface Role {
  readonly id: 'S' | 'T' | 'P' | 'A';
  readonly name: string;
  readonly account: Account;
  readonly home: string;
  /** The app bar's title on a phone. */
  readonly title: string;
  readonly h1: string | RegExp;
  readonly blocks: readonly Block[];
  readonly headerLinks: readonly { readonly name: string; readonly href: string | RegExp }[];
  readonly menu: Menu;
  /** Routes that make every block empty (set before the home loads). */
  readonly emptyRoutes: (page: Page) => Promise<void>;
}

const json =
  (body: unknown, status = 200) =>
  (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const down = json({ statusCode: 500, message: 'Panne de test.' }, 500);
/** The teacher's home reads ONE call (`GET /teacher/summary`); its sections fail separately (`failed`). */
const SUMMARY = '**/api/teacher/summary';
/** Answers the summary call with the real answer changed by `change` (the API is real, the data is arranged). */
const summaryWith = (change: (summary: TeacherSummaryDto) => TeacherSummaryDto) => async (route: Route) => {
  const real = (await (await route.fetch()).json()) as TeacherSummaryDto;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(change(real)) });
};
const noPosts = { items: [], total: 0, page: 1, pageSize: 2 };
const today = new Date().toISOString().slice(0, 10);

const ROLES: readonly Role[] = [
  {
    id: 'S',
    name: 'Élève',
    account: ACCOUNTS.student,
    home: '/eleve',
    title: 'Accueil',
    h1: /Bonjour/,
    blocks: [
      { heading: 'Maintenant', link: 'Emploi du temps de la semaine', path: '/eleve/emploi-du-temps', h1: 'Emploi du temps', wide: true, failing: '**/api/timetable/occurrences*', empty: /Pas de cours|Plus de cours|week-end|Aucun cours|vacances|Prochain|férié/i },
      { heading: 'À faire', link: 'Tous les devoirs et contrôles', path: '/eleve/agenda', h1: /Examens et devoirs|Agenda/, failing: '**/api/homework*', empty: /Rien à rendre/ },
      { heading: 'Notes', link: 'Toutes les notes et le bulletin', path: '/eleve/notes', h1: 'Mes notes', failing: '**/api/students/*/grades*', empty: /Aucune note|pas encore de note/i },
      { heading: 'Absences', link: 'Détail des absences', path: '/eleve/absences', h1: /Absences/, failing: '**/api/students/*/attendance*', empty: /Aucune absence|pas d’absence/i },
      { heading: 'Annonces', link: 'Toutes les annonces', path: '/eleve/annonces', h1: 'Annonces', wide: true, failing: '**/api/posts*', empty: /Aucune annonce/ },
    ],
    headerLinks: [],
    menu: {
      desktop: ['Accueil', 'Emploi du temps', 'Devoirs', 'Notifications', 'Synchroniser mon agenda'],
      phone: ['Accueil', 'Horaire', 'Devoirs', 'Plus'],
      plus: ['Accueil', 'Emploi du temps', 'Devoirs', 'Notifications', 'Synchroniser mon agenda'],
    },
    emptyRoutes: async (page) => {
      await page.route('**/api/timetable/occurrences*', json([]));
      await page.route('**/api/homework*', json([]));
      await page.route('**/api/events/occurrences*', json([]));
      await page.route('**/api/students/*/grades*', json({ studentId: 'x', subjects: [] }));
      await page.route('**/api/students/*/report-cards*', json([]));
      await page.route('**/api/students/*/attendance*', json([]));
      await page.route('**/api/posts*', json(noPosts));
    },
  },
  {
    id: 'T',
    name: 'Enseignant',
    account: ACCOUNTS.teacher,
    home: '/enseignant',
    title: 'Accueil',
    h1: /Bonjour/,
    blocks: [
      { heading: 'Mes cours aujourd’hui', link: 'Mon emploi du temps de la semaine', path: '/enseignant/emploi-du-temps', h1: 'Mon emploi du temps', wide: true, failing: SUMMARY, section: 'lessons', empty: /Pas de cours aujourd’hui|C’est le week-end/ },
      { heading: 'Notes à finir', link: 'Noter une classe', path: '/enseignant/noter', h1: 'Noter', failing: SUMMARY, section: 'pending', shares: ['À surveiller'], empty: /Aucune note à finir/ },
      { heading: 'Devoirs donnés', link: 'Tous mes devoirs', path: '/enseignant/agenda', h1: 'Agenda', failing: SUMMARY, section: 'homework', empty: /Aucun devoir à rendre/ },
      { heading: 'À surveiller', link: 'Mes classes', path: '/enseignant/classes', h1: 'Mes classes', failing: SUMMARY, section: 'absences', empty: /Rien à signaler/ },
      { heading: 'Annonces', link: 'Écrire ou lire les annonces', path: '/enseignant/annonces', h1: 'Annonces', wide: true, failing: '**/api/posts*', empty: /Aucune annonce/ },
    ],
    headerLinks: [{ name: 'Nouvelle note', href: '/enseignant/noter' }],
    menu: {
      desktop: ['Accueil', 'Mon emploi du temps', 'Appel', 'Groupes', 'Notifications', 'Synchroniser mon agenda'],
      phone: ['Accueil', 'Horaire', 'Appel', 'Plus'],
      plus: ['Accueil', 'Mon emploi du temps', 'Appel', 'Groupes', 'Notifications', 'Synchroniser mon agenda'],
    },
    emptyRoutes: async (page) => {
      await page.route(SUMMARY, summaryWith((real) => ({ ...real, failed: [], lessons: [], calendarDays: [], pending: [], homework: [], tests: [], absences: [] })));
      await page.route('**/api/posts*', json(noPosts));
    },
  },
  {
    id: 'P',
    name: 'Planificateur',
    account: ACCOUNTS.planner,
    home: '/admin/planification',
    title: 'Planification',
    h1: 'Planification',
    blocks: [
      { heading: 'À régler', link: 'Régler les conflits', path: '/admin/emploi-du-temps', h1: 'Emploi du temps', failing: '**/api/timetable/warnings*', shares: [], empty: /Rien à régler/ },
      { heading: 'Changements aujourd’hui', link: 'Toutes les modifications', path: '/admin/emploi-du-temps', h1: 'Emploi du temps', failing: '**/api/planner/today*', empty: /Aucun changement/ },
      { heading: 'Salles maintenant', link: 'Occupation des salles', path: '/admin/emploi-du-temps', h1: 'Emploi du temps', failing: '**/api/planner/rooms-now*', empty: /Aucune salle/ },
      { heading: 'L’année', link: 'Calendrier de l’année', path: '/admin/annees', h1: /Années? scolaires?/, wide: true, failing: '**/api/calendar-days*', empty: /Aucune année scolaire/ },
      { heading: 'Emplois du temps', link: 'Ouvrir la grille (classe, enseignant, salle)', path: '/admin/emploi-du-temps', h1: 'Emploi du temps', wide: true, failing: '**/api/planner/timetables*', shares: ['À régler'], empty: /Aucune classe/ },
    ],
    headerLinks: [
      { name: 'Professeur absent', href: '/admin/planification/professeur-absent' },
    ],
    menu: {
      desktop: ['Accueil', 'Classes', 'Emploi du temps', 'Plus'],
      phone: ['Accueil', 'Classes', 'Horaire', 'Plus'],
      plus: ['Accueil', 'Classes', 'Emploi du temps', 'Matières', 'Groupes', 'Salles', 'Types d’activité', 'Année scolaire', 'Mon espace enseignant'],
    },
    emptyRoutes: async (page) => {
      await page.route('**/api/planner/today*', json({ date: today, changes: [] }));
      await page.route('**/api/planner/rooms-now*', json({ date: today, time: '10:00', free: [], total: 0 }));
      await page.route('**/api/planner/timetables*', json({ yearLabel: '2026-2027', classes: [], teachersPlaced: 0, teachersTotal: 0 }));
      await page.route('**/api/timetable/warnings*', json([]));
      await page.route('**/api/school-years*', json([]));
    },
  },
  {
    id: 'A',
    name: 'Administration',
    account: ACCOUNTS.admin,
    home: '/admin',
    title: 'Accueil',
    h1: /Bonjour/,
    blocks: [
      { heading: 'À valider', link: 'Tout valider', path: '/admin/validations', h1: 'Validations', failing: '**/api/section-changes*', empty: /Rien à valider/ },
      { heading: 'Messages', link: 'Boîte de réception', path: '/admin/messages', h1: 'Messages', failing: '**/api/contact-messages*', empty: /Aucun nouveau message/ },
      { heading: 'Classes', link: 'Classes et inscriptions', path: '/admin/classes', h1: 'Classes', failing: '**/api/classes*', empty: /Aucune classe/ },
      { heading: 'Bulletins', link: 'Préparer les bulletins', path: '/admin/bulletins/preparation', h1: 'Préparer les bulletins', wide: true, failing: '**/api/periods/*/report-preparation', empty: /Rien à préparer/ },
      { heading: 'Rôles', link: 'Comptes et droits', path: '/admin/utilisateurs', h1: 'Utilisateurs', failing: '**/api/users*isPlanner=true*', empty: /Personne n’a encore le droit/ },
      { heading: 'Année scolaire', link: 'Nouvelle année', path: '/admin/nouvelle-annee', h1: /Nouvelle année|Année suivante/, failing: '**/api/school-years', shares: ['Classes', 'Bulletins'], empty: /Aucune année scolaire en cours/ },
      { heading: 'Annonces', link: 'Écrire une annonce', path: '/admin/annonces', h1: 'Annonces', failing: '**/api/posts*', empty: /Aucune annonce/ },
    ],
    headerLinks: [
      { name: 'Ajouter un compte', href: /\/admin\/utilisateurs\?action=creer$/ },
      { name: 'Importer une liste', href: /\/admin\/utilisateurs\?action=importer$/ },
    ],
    menu: {
      desktop: ['Accueil', 'Planification', 'Classes', 'Emploi du temps', 'Affectations', 'Plus'],
      phone: ['Accueil', 'Planif.', 'Classes', 'Horaire', 'Plus'],
      plus: ['Accueil', 'Planification', 'Classes', 'Emploi du temps', 'Affectations', 'Matières', 'Groupes', 'Salles', 'Types d’activité', 'Année scolaire'],
    },
    emptyRoutes: async (page) => {
      await page.route('**/api/section-changes*', json({ items: [], total: 0, page: 1, pageSize: 3 }));
      await page.route('**/api/contact-messages*', json({ items: [], total: 0, page: 1, pageSize: 3 }));
      await page.route('**/api/classes*', json([]));
      await page.route('**/api/posts*', json(noPosts));
      await page.route('**/api/school-years', json([]));
      await page.route('**/api/users*', json({ items: [], total: 0, page: 1, pageSize: 1 }));
    },
  },
];

const block = (page: Page, heading: string): Locator => page.getByRole('region', { name: heading, exact: true });
const pageStatus = (page: Page): Locator => page.locator('app-home-status').getByRole('status');
const PHONE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

/** Signs in and opens the role's home on a page that has finished loading. */
async function openHome(page: Page, role: Role, before?: (page: Page) => Promise<void>): Promise<void> {
  // Routes are set before signing in: root services (school years) load once, on the first page.
  if (before) await before(page);
  await signInAs(page, role.account);
  if (new URL(page.url()).pathname !== role.home) await goInApp(page, role.home);
  await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(role.h1);
}

async function settled(page: Page): Promise<void> {
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
}

for (const role of ROLES) {
  test.describe(`${role.name}`, () => {
    const { id } = role;

    test(`${id}1 the blocks are present in the agreed order, with the agreed heading, and the page has one h1 and one live region`, async ({ page }) => {
      await openHome(page, role);
      await settled(page);
      await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(role.blocks.map((b) => b.heading));
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.locator('.app-bar__title')).toHaveText(role.title);
      await expect(page.getByRole('status')).toHaveCount(1);
      await expect(pageStatus(page)).toHaveText('Page chargée.');
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      for (const b of role.blocks) await expect(block(page, b.heading)).toBeVisible();
    });

    test(`${id}2 each block ends with its entry button (agreed label) that opens the agreed route`, async ({ page }) => {
      await openHome(page, role);
      await settled(page);
      for (const b of role.blocks) {
        const region = block(page, b.heading);
        const entry = region.getByRole('link', { name: b.link, exact: true });
        await expect(entry, `${b.heading}: « ${b.link} »`).toHaveAttribute('href', b.path);
        // The entry button is the block's last link: the last thing in it.
        await expect(region.getByRole('link').last()).toHaveAccessibleName(b.link);
        await entry.click();
        await expect(page).toHaveURL((url) => url.pathname === b.path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(b.h1);
        await goInApp(page, role.home);
        await settled(page);
      }
    });

    if (role.headerLinks.length)
      test(`${id}3 the header buttons ${role.headerLinks.map((l) => `« ${l.name} »`).join(' and ')} are in the page header and open their route`, async ({ page }) => {
        await openHome(page, role);
        await settled(page);
        for (const h of role.headerLinks) {
          const link = page.locator('.page__header').getByRole('link', { name: h.name, exact: true });
          await expect(link, h.name).toHaveAttribute('href', h.href);
          await link.click();
          await expect(page).toHaveURL(h.href instanceof RegExp ? h.href : (url) => `${url.pathname}${url.search}` === h.href);
          if (id === 'A') await expect(page.getByRole('dialog')).toBeVisible();
          await goInApp(page, role.home);
          await settled(page);
        }
      });

    test(`${id}4 layout: one column in the agreed order on a phone, three columns with the wide blocks across from tablet width`, async ({ page }) => {
      await openHome(page, role);
      await settled(page);
      const boxes = async () => Promise.all(role.blocks.map((b) => block(page, b.heading).boundingBox()));
      await page.setViewportSize(PHONE);
      const phone = await boxes();
      for (let i = 1; i < phone.length; i++) {
        expect(phone[i]!.y, `${role.blocks[i]!.heading} under ${role.blocks[i - 1]!.heading}`).toBeGreaterThan(phone[i - 1]!.y);
        expect(Math.round(phone[i]!.x)).toBe(Math.round(phone[0]!.x));
      }
      for (const b of role.blocks) {
        const box = await block(page, b.heading).getByRole('link', { name: b.link, exact: true }).boundingBox();
        expect(box!.height, `${b.heading}: entry button is a touch target`).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      await page.setViewportSize(DESKTOP);
      const wide = await boxes();
      const narrow = wide.filter((_, i) => !role.blocks[i]!.wide);
      const narrowWidth = Math.min(...narrow.map((b) => b!.width));
      wide.forEach((box, i) => {
        const b = role.blocks[i]!;
        // Reading order: below the one before, or on its row and to its right.
        if (i > 0) {
          const before = wide[i - 1]!;
          expect(box!.y > before!.y + 1 || (Math.abs(box!.y - before!.y) < 2 && box!.x > before!.x), `${b.heading} reads after ${role.blocks[i - 1]!.heading}`).toBe(true);
        }
        if (b.wide) expect(box!.width, `${b.heading} is wide`).toBeGreaterThan(narrowWidth * 2.5);
      });
      // Narrow blocks share rows: at least two columns.
      const rows = new Set(narrow.map((b) => Math.round(b!.y)));
      expect(rows.size, 'narrow blocks sit side by side').toBeLessThan(narrow.length);
    });

    test(`${id}5 a failing source fails its own block only: error and « Réessayer », entry link still shown, the page stays usable`, async ({ page }) => {
      test.setTimeout(120_000);
      for (const failing of role.blocks) {
        let broken = true;
        await page.context().clearCookies();
        await page.goto('/');
        const handler = (route: Route) =>
          !broken ? route.continue() : failing.section ? summaryWith((real) => ({ ...real, failed: [failing.section!], [failing.section!]: [] }))(route) : down(route);
        await page.route(failing.failing, handler);
        await signInAs(page, role.account);
        if (new URL(page.url()).pathname !== role.home) await goInApp(page, role.home);
        await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(role.h1);

        const own = block(page, failing.heading);
        await expect(own.getByRole('alert'), `${failing.heading} shows its error`).toBeVisible({ timeout: 15_000 });
        await expect(own.getByRole('button', { name: 'Réessayer' })).toBeVisible();
        await expect(own.getByRole('link', { name: failing.link, exact: true }), 'entry link survives the error').toBeVisible();
        const affected = new Set([failing.heading, ...(failing.shares ?? [])]);
        await settled(page);
        for (const other of role.blocks.filter((b) => !affected.has(b.heading))) {
          await expect(block(page, other.heading).getByRole('alert'), `${other.heading} is untouched`).toHaveCount(0);
          await expect(block(page, other.heading).getByRole('link', { name: other.link, exact: true })).toBeVisible();
        }
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(role.blocks.length);
        await expect(pageStatus(page)).toContainText(failing.heading);
        await expect(page.getByRole('status')).toHaveCount(1);
        if (failing === role.blocks[0]) await axeAtBothWidths(page);

        broken = false;
        await own.getByRole('button', { name: 'Réessayer' }).click();
        await expect(own.getByRole('alert')).toHaveCount(0, { timeout: 15_000 });
        await page.unroute(failing.failing, handler);
      }
    });

    test(`${id}6 empty blocks invite (the agreed copy), no alert, entry links stay, Axe at 390 and 1440 px`, async ({ page }) => {
      await openHome(page, role, role.emptyRoutes);
      await settled(page);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(pageStatus(page)).toHaveText('Page chargée.');
      for (const b of role.blocks) {
        await expect(block(page, b.heading), `${b.heading} invites`).toContainText(b.empty);
        await expect(block(page, b.heading).getByRole('link', { name: b.link, exact: true })).toBeVisible();
      }
      await axeAtBothWidths(page);
    });

    test(`${id}7 loading: every block shows its own loading line and keeps its entry link; nothing is left loading`, async ({ page }) => {
      test.setTimeout(90_000);
      const slow = async (route: Route) => {
        await new Promise((resolve) => setTimeout(resolve, 8_000));
        await route.continue().catch(() => undefined);
      };
      await page.route(/\/api\/(?!auth)/, slow);
      await signInAs(page, role.account);
      if (new URL(page.url()).pathname !== role.home) await goInApp(page, role.home);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await Promise.all(
        role.blocks.map(async (b) => {
          await expect(block(page, b.heading).locator('.loading-line'), `${b.heading} loading`).toBeVisible({ timeout: 6_000 });
          await expect(block(page, b.heading).getByRole('link', { name: b.link, exact: true })).toBeVisible();
        }),
      );
      await page.unroute(/\/api\/(?!auth)/, slow);
      await settled(page);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test(`${id}8 menus: « Accueil » first, the agreed entries at 1440 px, the phone bar (five at most, « Plus » last), the « Plus » page`, async ({ page }) => {
      await openHome(page, role);
      await settled(page);
      await page.setViewportSize(DESKTOP);
      const top = page.locator('nav.app-bar__nav');
      await expect(top).toBeVisible();
      await expect(top.getByRole('link')).toHaveText(role.menu.desktop);
      await expect(top.getByRole('link').first()).toHaveText('Accueil');
      await expect(top.getByRole('link').first()).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('nav.bottom-nav')).toBeHidden();

      await page.setViewportSize(PHONE);
      const bar = page.locator('nav.bottom-nav');
      await expect(bar).toBeVisible();
      await expect(bar.getByRole('link')).toHaveText(role.menu.phone);
      expect(role.menu.phone.length).toBeLessThanOrEqual(5);
      await expect(bar.getByRole('link').last()).toHaveText('Plus');
      await expect(bar.getByRole('link').first()).toHaveAttribute('aria-current', 'page');
      for (const link of await bar.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      await bar.getByRole('link', { name: 'Plus', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Toutes les pages' })).toBeVisible();
      await expect(page.getByRole('main').getByRole('link')).toHaveText(role.menu.plus);
      await axeAtBothWidths(page);
    });

    test(`${id}9 Axe (WCAG 2.2 AA) on the ready page at 390 and 1440 px, no console error, no leftover placeholder or English`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
      });
      await openHome(page, role);
      await settled(page);
      await axeAtBothWidths(page);
      const text = await page.getByRole('main').innerText();
      expect(text).not.toMatch(/undefined|\bnull\b|NaN|\[object|\{\{|Loading|Retry|No data/);
      // French typography of the interface (not of announcements, which people write): ’, never a straight '.
      const chrome = await page.getByRole('main').locator('h1, h2, .page__header a, .home-block__entry, .home-block__empty').allInnerTexts();
      expect(chrome.filter((t) => t.includes("'"))).toEqual([]);
      expect(errors).toEqual([]);
    });

    test(`${id}10 layout at 390 and 1440 px: no sideways scroll, every block visible, Axe-clean`, async ({ page }) => {
      await openHome(page, role);
      await settled(page);
      for (const size of [PHONE, DESKTOP]) {
        await page.setViewportSize(size);
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll at ${size.width}`).toBe(true);
        for (const b of role.blocks) await expect(block(page, b.heading)).toBeVisible();
      }
      // Entry buttons stay inside their block.
      for (const blk of role.blocks) {
        const [box, entry] = await Promise.all([block(page, blk.heading).boundingBox(), block(page, blk.heading).getByRole('link', { name: blk.link, exact: true }).boundingBox()]);
        expect(entry!.x).toBeGreaterThanOrEqual(box!.x - 1);
        expect(entry!.x + entry!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
      }
      await axeAtBothWidths(page);
    });
  });
}

test.describe('Routing of the Planificateur permission', () => {
  test('R1 a teacher who is planificateur sees « Planification » in « Plus », which opens their page; « Mon espace enseignant » goes back', async ({ page }) => {
    await signInAs(page, ACCOUNTS.planner);
    await expect(page).toHaveURL(/\/enseignant$/);
    await page.setViewportSize(DESKTOP);
    await expect(page.locator('nav.app-bar__nav').getByRole('link')).toHaveText([
      'Accueil',
      'Mon emploi du temps',
      'Appel',
      'Groupes',
      'Notifications',
      'Synchroniser mon agenda',
      'Planification',
    ]);
    // On a phone the bar is unchanged; Planification is one of the « Plus » entries.
    await page.setViewportSize(PHONE);
    await expect(page.locator('nav.bottom-nav').getByRole('link')).toHaveText(['Accueil', 'Horaire', 'Appel', 'Plus']);
    await page.locator('nav.bottom-nav').getByRole('link', { name: 'Plus' }).click();
    await page.getByRole('main').getByRole('link', { name: 'Planification' }).click();
    await expect(page).toHaveURL(/\/admin\/planification$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Planification' })).toBeVisible();
    await expect(page.locator('.app-bar__title')).toHaveText('Planification');
    await settled(page);
    await axeAtBothWidths(page);
    // The way back to teaching.
    await page.locator('nav.bottom-nav').getByRole('link', { name: 'Plus' }).click();
    await page.getByRole('main').getByRole('link', { name: 'Mon espace enseignant' }).click();
    await expect(page).toHaveURL(/\/enseignant$/);
  });

  test('R2 a planner is not sent to the administration’s own home: /admin opens Planification; the admin’s pages are refused', async ({ page }) => {
    await signInAs(page, ACCOUNTS.planner);
    await goInApp(page, '/admin');
    await expect(page).toHaveURL(/\/admin\/planification$/);
    for (const path of ['/admin/utilisateurs', '/admin/bulletins/preparation', '/admin/validations', '/admin/messages']) {
      await page.evaluate((to) => {
        history.pushState(null, '', to);
        dispatchEvent(new PopStateEvent('popstate'));
      }, path);
      await expect(page).not.toHaveURL((url) => url.pathname === path);
    }
  });

  test('R3 a plain teacher has no « Planification » and is sent back to their space; a student too', async ({ page }) => {
    await signInAs(page, ACCOUNTS.teacher);
    await page.setViewportSize(DESKTOP);
    await expect(page.locator('nav.app-bar__nav').getByRole('link', { name: 'Planification' })).toHaveCount(0);
    await page.evaluate(() => {
      history.pushState(null, '', '/admin/planification');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/\/enseignant/);
    await page.context().clearCookies();
    await page.goto('/');
    await signInAs(page, ACCOUNTS.student);
    await page.evaluate(() => {
      history.pushState(null, '', '/admin/planification');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/\/eleve/);
  });

  test('R4 an administration account: its own « Accueil » (/admin), « Planification » as a screen of its own, « Professeur absent » there', async ({ page }) => {
    await signInAs(page, ACCOUNTS.admin);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bonjour');
    await page.setViewportSize(DESKTOP);
    await page.locator('nav.app-bar__nav').getByRole('link', { name: 'Planification', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/planification$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Planification' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Professeur absent', exact: true })).toBeVisible();
    await settled(page);
    await axeAtBothWidths(page);
  });

  // « Ajouter un examen » is a header button (a dialog) for the administration and for every planner.
  test('R5 « Ajouter un examen » is a header button on the planner page, for an administration account and for a teacher who plans; it opens a dialog', async ({ page }) => {
    for (const account of [ACCOUNTS.admin, ACCOUNTS.planner]) {
      await page.context().clearCookies();
      await page.goto('/');
      await signInAs(page, account);
      await goInApp(page, '/admin/planification');
      const button = page.locator('.page__header').getByRole('button', { name: 'Ajouter un examen', exact: true });
      await expect(button).toBeVisible();
      await button.click();
      await expect(page.getByRole('dialog', { name: 'Ajouter un examen' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
});

test.describe('« Noter » (quick grading)', () => {
  test('N1 step 1 « Quelle note ? » (new note, planned exam or draft), step 2 the grid with the agreed controls, Axe-clean', async ({ page, request }) => {
    test.setTimeout(90_000);
    const login = await request.post('/api/auth/login', { data: ACCOUNTS.student });
    const pupil = ((await login.json()) as { user: { classId: string } }).user;
    await signInAs(page, ACCOUNTS.teacher);
    await page.setViewportSize(DESKTOP);
    // « Nouvelle note » of the home page opens « Noter ».
    await page.getByRole('link', { name: 'Nouvelle note', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Noter' })).toBeVisible();
    await goInApp(page, `/enseignant/noter?classe=${pupil.classId}&matiere=mathematiques`);

    await expect(page.getByRole('heading', { level: 2, name: 'Quelle note ?' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Nouvelle note' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'À finir' })).toBeVisible();
    for (const label of ['Nom', 'Sur', 'Coefficient']) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    await settled(page);
    await axeAtBothWidths(page);

    const title = unique('Conformité');
    await page.getByLabel('Nom').fill(title);
    await page.getByRole('button', { name: 'Commencer la saisie' }).click();
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeFocused();
    await expect(page.getByText('Étape 2 sur 2')).toBeVisible();
    const marks = page.locator('input.grade-input');
    await expect(marks.first()).toBeVisible();
    // Enter goes to the next student; the class average is live; comment is optional.
    await marks.first().focus();
    await page.keyboard.type('12,5');
    await page.keyboard.press('Enter');
    await expect(marks.nth(1)).toBeFocused();
    await expect(page.locator('.toolbar__status')).toContainText(/1 \/ \d+ · moyenne 12,5/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Finir plus tard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier aux élèves' })).toBeVisible();
    await expect(page.getByLabel(/^Commentaire, /).first()).toBeVisible();
    await axeAtBothWidths(page);
    // « Finir plus tard » keeps it in « À finir » (and « Notes à finir » of the home page).
    await page.getByRole('button', { name: 'Finir plus tard' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Quelle note ?' })).toBeFocused();
    await expect(page.getByRole('button', { name: new RegExp(title) })).toContainText('brouillon');
    // Publishing asks first and says what it does.
    await page.getByRole('button', { name: new RegExp(title) }).click();
    await page.getByRole('button', { name: 'Publier aux élèves' }).click();
    await expect(page.getByRole('dialog', { name: 'Publier aux élèves ?' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  // Agreed: « Abs » in the grid means the student does not count. Built: there is no « Abs » control; an empty
  // cell is an absent student (documented in rollout.md's demo script and apps/web/CLAUDE.md « Noter »).
  test.fail('N2 the grid offers an explicit « Abs » for an absent student (agreed wording)', async ({ page, request }) => {
    const login = await request.post('/api/auth/login', { data: ACCOUNTS.student });
    const pupil = ((await login.json()) as { user: { classId: string } }).user;
    await signInAs(page, ACCOUNTS.teacher);
    await goInApp(page, `/enseignant/noter?classe=${pupil.classId}&matiere=mathematiques`);
    await page.getByLabel('Nom').fill(unique('Absents'));
    await page.getByRole('button', { name: 'Commencer la saisie' }).click();
    await expect(page.locator('input.grade-input').first()).toBeVisible();
    await expect(page.getByText(/^Abs$/).first()).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('« Préparer les bulletins »', () => {
  test('B1 per class: complete or not, the missing subject and its teacher; « Relancer » per class and for all (confirmed); Axe-clean', async ({ page }) => {
    await signInAs(page, ACCOUNTS.admin);
    await goInApp(page, '/admin/bulletins/preparation');
    await expect(page.getByRole('heading', { level: 1, name: 'Préparer les bulletins' })).toBeVisible();
    await settled(page);
    await page.setViewportSize(DESKTOP);
    await expect(page.getByLabel(/Période|Trimestre|Semestre/).first()).toBeVisible();
    const table = page.getByRole('table');
    await expect(table.locator('caption')).toHaveCount(1);
    await expect(table.getByRole('row')).not.toHaveCount(1);
    await expect(table.getByRole('columnheader').first()).toBeVisible();
    // The class row says complete or not.
    await expect(table.getByText(/complète|complet|prête|prêt|À finir|incomplet/i).first()).toBeVisible();
    await table.getByText('Détail, matière par matière').first().click();
    await expect(table.getByText(/notes? (saisies?|à publier)|aucune note saisie/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Relancer les enseignants de/ }).first()).toBeVisible();
    // « Relancer tous » asks first, says how many teachers, and Annuler changes nothing.
    await page.getByRole('button', { name: 'Relancer tous les enseignants en retard' }).click();
    const dialog = page.getByRole('dialog', { name: /^Relancer \d+ enseignants? \?$/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('status').filter({ hasText: /relancé/ })).toHaveCount(0);
    // Generation and publication stay on the Bulletins page, which the page links to.
    await expect(page.getByRole('link', { name: /Bulletins|Générer et publier/ }).first()).toBeVisible();
    await axeAtBothWidths(page);
  });

  // Agreed (step 1): « complete classes can be generated at once ». Built: the page links to the existing Bulletins page.
  test.fail('B2 complete classes can be generated at once from this page', async ({ page }) => {
    await signInAs(page, ACCOUNTS.admin);
    await goInApp(page, '/admin/bulletins/preparation');
    await settled(page);
    await expect(page.getByRole('button', { name: /Générer les bulletins/ }).first()).toBeVisible({ timeout: 3_000 });
  });
});
