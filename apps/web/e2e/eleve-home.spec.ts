import { addDays, schoolToday } from '@cdls/shared';
import { type APIRequestContext, expect, type Locator, type Page, type Route, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { axeAtBothWidths, goInApp, signInAs, tokenOf } from './structure';

/**
 * The student's one page (/eleve): five blocks in order, each with its heading and one entry link, Axe-clean
 * at 390 and 1440 px; a homework ticked from « À faire » is saved; each entry link opens its detail page.
 * Widths are set inside the tests, so the phone project is skipped.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside each test');
});

const BLOCKS = [
  { heading: 'Maintenant', link: 'Emploi du temps de la semaine', path: '/eleve/emploi-du-temps', h1: 'Emploi du temps' },
  { heading: 'À faire', link: 'Tous les devoirs et contrôles', path: '/eleve/agenda', h1: /Examens et devoirs|Agenda/ },
  { heading: 'Notes', link: 'Toutes les notes et le bulletin', path: '/eleve/notes', h1: 'Mes notes' },
  { heading: 'Absences', link: 'Détail des absences', path: '/eleve/absences', h1: /Absences/ },
  { heading: 'Annonces', link: 'Toutes les annonces', path: '/eleve/annonces', h1: 'Annonces' },
] as const;

const block = (page: Page, heading: string): Locator => page.getByRole('region', { name: heading, exact: true });

async function openHome(page: Page): Promise<void> {
  await signInAs(page, ACCOUNTS.student);
  await goInApp(page, '/eleve');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bonjour');
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
}

test('the five blocks stack in order on a phone, three side by side from tablet width, Axe-clean', async ({ page }) => {
  const errors: string[] = [];
  const yearsRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/school-years') yearsRequests.push(r.url());
  });
  await openHome(page);
  // Notes and Absences share one source for the school years and the term.
  expect(yearsRequests).toHaveLength(1);

  // Order of the sections and of their h2 headings.
  const headings = page.getByRole('main').getByRole('heading', { level: 2 });
  await expect(headings).toHaveText(BLOCKS.map((b) => b.heading));
  for (const b of BLOCKS) {
    const region = block(page, b.heading);
    await expect(region).toBeVisible();
    // One entry link per block, a real link with a descriptive name.
    await expect(region.getByRole('link')).not.toHaveCount(0);
    await expect(region.getByRole('link', { name: b.link, exact: true })).toHaveAttribute('href', b.path);
  }

  const boxes = async () => Promise.all(BLOCKS.map((b) => block(page, b.heading).boundingBox()));
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await boxes();
  for (let i = 1; i < phone.length; i++) expect(phone[i]!.y, `${BLOCKS[i]!.heading} below the block before`).toBeGreaterThan(phone[i - 1]!.y);
  // The entry links are at least 44 px high on touch screens.
  for (const b of BLOCKS) {
    const box = await block(page, b.heading).getByRole('link', { name: b.link, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const [now, todo, grades, absences, news] = await boxes();
  expect(Math.round(todo!.y)).toBe(Math.round(grades!.y));
  expect(Math.round(grades!.y)).toBe(Math.round(absences!.y));
  expect(todo!.x).toBeLessThan(grades!.x);
  expect(grades!.x).toBeLessThan(absences!.x);
  expect(now!.width).toBeGreaterThan(todo!.width * 2.5);
  expect(news!.width).toBeGreaterThan(todo!.width * 2.5);
  expect(news!.y).toBeGreaterThan(todo!.y);

  await axeAtBothWidths(page);
  expect(errors).toEqual([]);
});

/** A teacher of the student's class gives a homework due in two days (removed after the test). */
async function giveHomework(request: APIRequestContext, title: string): Promise<{ id: string; teacher: { Authorization: string } }> {
  const student = await tokenOf(request, ACCOUNTS.student);
  const { classId } = (await (await request.get('/api/auth/me', { headers: student })).json()) as { classId: string };
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const { teacherId } = (await (await request.get('/api/auth/me', { headers: teacher })).json()) as { teacherId: string };
  const assignments = (await (await request.get(`/api/teaching-assignments?teacherId=${teacherId}`, { headers: teacher })).json()) as {
    classId: string;
    subjectId: string;
  }[];
  const assignment = assignments.find((a) => a.classId === classId);
  expect(assignment, 'the demo teacher teaches the demo student’s class').toBeTruthy();
  const types = (await (await request.get('/api/activity-types', { headers: teacher })).json()) as { id: string; code: string }[];
  const devoir = types.find((t) => t.code === 'devoir');
  expect(devoir).toBeTruthy();
  const created = await request.post('/api/events', {
    headers: teacher,
    data: { activityTypeId: devoir!.id, title, subjectId: assignment!.subjectId, classId, date: addDays(schoolToday(), 2) },
  });
  expect(created.status()).toBe(201);
  return { id: ((await created.json()) as { id: string }).id, teacher };
}

test('a homework ticked from « À faire » is saved, as on the Devoirs page', async ({ page, request }) => {
  const title = `Exercices ${Date.now()}`;
  const homework = await giveHomework(request, title);
  try {
    await openHome(page);
    const box = block(page, 'À faire').getByRole('checkbox', { name: title });
    await expect(box).not.toBeChecked();

    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/homework/${homework.id}/done`) && r.ok());
    await box.click();
    await saved;
    await expect(box).toBeChecked();
    // The item stays in place: the focus stays on its box.
    await expect(box).toBeFocused();
    await axeAtBothWidths(page);

    // The Devoirs page reads the same state from the API.
    await goInApp(page, '/eleve/devoirs');
    await expect(page.getByRole('checkbox', { name: title })).toBeChecked();

    // Unticking from the home page works too.
    await goInApp(page, '/eleve');
    const again = block(page, 'À faire').getByRole('checkbox', { name: title });
    await expect(again).toBeChecked();
    const undone = page.waitForResponse((r) => r.url().endsWith(`/api/homework/${homework.id}/done`) && r.ok());
    await again.click();
    await undone;
    await expect(again).not.toBeChecked();
  } finally {
    await request.delete(`/api/events/${homework.id}`, { headers: homework.teacher });
  }
});

test('each entry link opens its detail page', async ({ page }) => {
  await openHome(page);
  for (const b of BLOCKS) {
    await goInApp(page, '/eleve');
    await block(page, b.heading).getByRole('link', { name: b.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${b.path}$`));
    await expect(page.getByRole('heading', { level: 1, name: b.h1 })).toBeVisible();
  }
  // The full list of announcements (a new page) is Axe-clean too.
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await axeAtBothWidths(page);
});

/** The page's ONE permanent live region (updated with text; the five blocks add no region of their own). */
const pageStatus = (page: Page): Locator => page.locator('app-home-status').getByRole('status');

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('a block that fails shows its own error and « Réessayer »; the page lives on; Axe-clean; the retry works', async ({ page }) => {
  await signInAs(page, ACCOUNTS.student);
  // Routes are set while another page is open, so the home page's requests go through them.
  await goInApp(page, '/eleve/absences');
  let failing = true;
  await page.route('**/api/posts*', (route) =>
    failing
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Les annonces sont indisponibles pour le moment.' }) })
      : route.continue(),
  );
  await goInApp(page, '/eleve');

  const news = block(page, 'Annonces');
  await expect(news.getByRole('alert')).toContainText('Les annonces sont indisponibles');
  const retry = news.getByRole('button', { name: 'Réessayer' });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // The other blocks are untouched, and the one live region names the block that failed.
  for (const heading of ['Maintenant', 'À faire', 'Notes', 'Absences']) await expect(block(page, heading).getByRole('alert')).toHaveCount(0);
  await expect(pageStatus(page)).toHaveText('Page chargée. Le bloc « Annonces » n’a pas pu être chargé.');
  await expect(page.getByRole('status')).toHaveCount(1);
  await axeAtBothWidths(page);

  failing = false;
  await retry.click();
  await expect(news.getByRole('alert')).toHaveCount(0);
  await expect(news.getByRole('article').first()).toBeVisible();
  await expect(news.getByRole('link', { name: 'Toutes les annonces', exact: true })).toBeVisible();
  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await axeAtBothWidths(page);
});

test('empty blocks invite instead of apologising; Axe-clean at 390 and 1440 px', async ({ page }) => {
  await signInAs(page, ACCOUNTS.student);
  await goInApp(page, '/eleve/absences');
  await page.route('**/api/timetable/occurrences*', json([]));
  await page.route('**/api/homework*', json([]));
  await page.route('**/api/events/occurrences*', json([]));
  await page.route('**/api/students/*/grades*', json({ studentId: 'x', subjects: [] }));
  await page.route('**/api/students/*/report-cards*', json([]));
  await page.route('**/api/students/*/attendance*', json([]));
  await page.route('**/api/posts*', json({ items: [], total: 0, page: 1, pageSize: 2 }));
  await goInApp(page, '/eleve');

  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await expect(block(page, 'Maintenant')).toContainText(/Pas de cours aujourd’hui|C’est le week-end/);
  await expect(block(page, 'À faire')).toContainText('Rien à rendre ni contrôle prévu');
  await expect(block(page, 'Notes')).toContainText('Pas encore de note publiée');
  await expect(block(page, 'Absences')).toContainText('Aucune absence ni aucun retard');
  await expect(block(page, 'Annonces')).toContainText('Aucune annonce pour l’instant');
  // Each block still ends with its entry link, empty or not.
  for (const b of BLOCKS) await expect(block(page, b.heading).getByRole('link', { name: b.link, exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await axeAtBothWidths(page);
});
