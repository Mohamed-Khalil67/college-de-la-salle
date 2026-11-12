import { addDays, schoolToday } from '@cdls/shared';
import { type APIRequestContext, expect, type Locator, type Page, type Route, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { axeAtBothWidths, goInApp, signInAs, tokenOf } from './structure';

/**
 * The teacher's one page (/enseignant): five blocks in order, each with its heading and one entry link, Axe-clean
 * at 390 and 1440 px; each lesson offers Appel / Noter / Devoir; a block that fails or is empty says so on its
 * own; each entry link opens its detail page. Widths are set inside the tests, so the phone project is skipped.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside each test');
});

const BLOCKS = [
  { heading: 'Mes cours aujourd’hui', link: 'Mon emploi du temps de la semaine', path: '/enseignant/emploi-du-temps', h1: 'Mon emploi du temps' },
  { heading: 'Notes à finir', link: 'Noter une classe', path: '/enseignant/noter', h1: 'Noter' },
  { heading: 'Devoirs donnés', link: 'Tous mes devoirs', path: '/enseignant/agenda', h1: 'Agenda' },
  { heading: 'À surveiller', link: 'Mes classes', path: '/enseignant/classes', h1: 'Mes classes' },
  { heading: 'Annonces', link: 'Écrire ou lire les annonces', path: '/enseignant/annonces', h1: 'Annonces' },
] as const;

const block = (page: Page, heading: string): Locator => page.getByRole('region', { name: heading, exact: true });
/** The page's ONE permanent live region. */
const pageStatus = (page: Page): Locator => page.locator('app-home-status').getByRole('status');
const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function openHome(page: Page): Promise<void> {
  await signInAs(page, ACCOUNTS.teacher);
  await goInApp(page, '/enseignant');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bonjour');
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
}

/** Opens another page and waits for it, so the home page opened next loads again (through the routes set meanwhile). */
async function leaveHome(page: Page): Promise<void> {
  await goInApp(page, '/enseignant/classes');
  await expect(page.getByRole('heading', { level: 1, name: 'Mes classes' })).toBeVisible();
}

/** One lesson of today, open all day (so « En cours »), and a cancelled one. */
function lessons(): unknown[] {
  const today = schoolToday();
  const values = { date: today, startTime: '00:01', endTime: '23:58', roomId: 'r1', roomName: 'Salle 12', teacherId: 't1', teacherName: 'Hany Mansour' };
  const base = {
    originalDate: today,
    status: 'normal',
    current: values,
    original: values,
    changes: [],
    movedTo: null,
    exceptionId: null,
    reason: '',
    classId: '11111111-1111-4111-8111-111111111111',
    classLabel: 'Première A',
    subjectId: 'mathematiques',
    subjectName: 'Mathématiques',
    activityType: { id: 'a', code: 'cours', label: 'Cours', color: '#000', icon: 'book', gradable: false, repeatable: true, homework: false },
    division: null,
    groupId: null,
    groupLabel: null,
    canChange: false,
  };
  return [
    { ...base, key: `s1@${today}`, slotId: 's1' },
    { ...base, key: `s2@${today}`, slotId: 's2', status: 'cancelled', subjectName: 'Physique', subjectId: 'physique' },
  ];
}

test('the five blocks stack in order on a phone, three side by side from tablet width, Axe-clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openHome(page);

  const headings = page.getByRole('main').getByRole('heading', { level: 2 });
  await expect(headings).toHaveText(BLOCKS.map((b) => b.heading));
  for (const b of BLOCKS) {
    const region = block(page, b.heading);
    await expect(region).toBeVisible();
    await expect(region.getByRole('link', { name: b.link, exact: true })).toHaveAttribute('href', b.path);
  }
  // « Nouvelle note » grades any class, not only today's.
  await expect(page.getByRole('link', { name: 'Nouvelle note' })).toHaveAttribute('href', '/enseignant/noter');
  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await expect(page.getByRole('status')).toHaveCount(1);

  const boxes = async () => Promise.all(BLOCKS.map((b) => block(page, b.heading).boundingBox()));
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await boxes();
  for (let i = 1; i < phone.length; i++) expect(phone[i]!.y, `${BLOCKS[i]!.heading} below the block before`).toBeGreaterThan(phone[i - 1]!.y);
  for (const b of BLOCKS) {
    const box = await block(page, b.heading).getByRole('link', { name: b.link, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const [lessonsBox, grading, homework, watch, news] = await boxes();
  expect(Math.round(grading!.y)).toBe(Math.round(homework!.y));
  expect(Math.round(homework!.y)).toBe(Math.round(watch!.y));
  expect(grading!.x).toBeLessThan(homework!.x);
  expect(homework!.x).toBeLessThan(watch!.x);
  expect(lessonsBox!.width).toBeGreaterThan(grading!.width * 2.5);
  expect(news!.width).toBeGreaterThan(grading!.width * 2.5);
  expect(news!.y).toBeGreaterThan(grading!.y);

  await axeAtBothWidths(page);
  expect(errors).toEqual([]);
});

test('each lesson of the day has Appel, Noter and Devoir; the one in progress is marked; a cancelled one has none', async ({ page }) => {
  await signInAs(page, ACCOUNTS.teacher);
  await leaveHome(page);
  await page.route('**/api/timetable/occurrences*', json(lessons()));
  await goInApp(page, '/enseignant');
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });

  const region = block(page, 'Mes cours aujourd’hui');
  await expect(region).toContainText('1 cours aujourd’hui');
  const items = region.getByRole('listitem');
  await expect(items).toHaveCount(2);
  const live = items.first();
  await expect(live).toContainText('En cours');
  await expect(live.getByRole('link', { name: 'Appel Première A, Mathématiques', exact: true })).toHaveAttribute(
    'href',
    '/enseignant/appel?classe=11111111-1111-4111-8111-111111111111',
  );
  await expect(live.getByRole('link', { name: 'Noter Première A, Mathématiques', exact: true })).toHaveAttribute(
    'href',
    '/enseignant/noter?classe=11111111-1111-4111-8111-111111111111&matiere=mathematiques',
  );
  await expect(live.getByRole('link', { name: 'Devoir Première A, Mathématiques', exact: true })).toHaveAttribute('href', '/enseignant/agenda');
  await expect(items.nth(1)).toContainText('Annulée');
  await expect(items.nth(1).getByRole('link')).toHaveCount(0);
  for (const name of ['Appel', 'Noter', 'Devoir']) {
    const box = await live.getByRole('link', { name: new RegExp(`^${name} `) }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await axeAtBothWidths(page);
});

/** A teacher gives a homework due in two days; its owner ticks it (removed after the test). */
async function giveHomework(request: APIRequestContext, title: string): Promise<{ id: string; teacher: { Authorization: string } }> {
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const { teacherId } = (await (await request.get('/api/auth/me', { headers: teacher })).json()) as { teacherId: string };
  const assignments = (await (await request.get(`/api/teaching-assignments?teacherId=${teacherId}`, { headers: teacher })).json()) as {
    classId: string;
    subjectId: string;
  }[];
  const assignment = assignments[0];
  expect(assignment, 'the demo teacher teaches a class').toBeTruthy();
  const types = (await (await request.get('/api/activity-types', { headers: teacher })).json()) as { id: string; homework: boolean }[];
  const devoir = types.find((t) => t.homework);
  expect(devoir).toBeTruthy();
  const created = await request.post('/api/events', {
    headers: teacher,
    data: { activityTypeId: devoir!.id, title, subjectId: assignment!.subjectId, classId: assignment!.classId, date: addDays(schoolToday(), 2) },
  });
  expect(created.status()).toBe(201);
  return { id: ((await created.json()) as { id: string }).id, teacher };
}

test('a homework the teacher gave appears in « Devoirs donnés » with its ticks', async ({ page, request }) => {
  const title = `Exercices ${Date.now()}`;
  const homework = await giveHomework(request, title);
  try {
    await openHome(page);
    const region = block(page, 'Devoirs donnés');
    await expect(region).toContainText(title);
    await expect(region).toContainText(/Aucun élève sur \d+ ne l’a fait|Personne ne l’a encore fait/);
    await axeAtBothWidths(page);
  } finally {
    await request.delete(`/api/events/${homework.id}`, { headers: homework.teacher });
  }
});

test('each entry link opens its detail page', async ({ page }) => {
  await openHome(page);
  for (const b of BLOCKS) {
    await goInApp(page, '/enseignant');
    await block(page, b.heading).getByRole('link', { name: b.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${b.path}$`));
    await expect(page.getByRole('heading', { level: 1, name: b.h1 })).toBeVisible();
  }
  // « Mes classes » still reaches the grade and roll-call pages with its class in the address.
  await leaveHome(page);
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('link', { name: /^Saisir des notes/ }).first()).toHaveAttribute('href', /^\/enseignant\/notes\?classe=/);
  await axeAtBothWidths(page);
});

test('a block that fails shows its own error and « Réessayer »; the page lives on; Axe-clean; the retry works', async ({ page }) => {
  await signInAs(page, ACCOUNTS.teacher);
  await leaveHome(page);
  let failing = true;
  await page.route('**/api/grading/pending*', (route) =>
    failing
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Les notes sont indisponibles pour le moment.' }) })
      : route.continue(),
  );
  await goInApp(page, '/enseignant');

  const grading = block(page, 'Notes à finir');
  await expect(grading.getByRole('alert')).toContainText('Les notes sont indisponibles');
  const retry = grading.getByRole('button', { name: 'Réessayer' });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // « À surveiller » reads the same notes (fetched once for the page), so it says so too; the other blocks are untouched.
  await expect(block(page, 'À surveiller').getByRole('alert')).toHaveCount(1);
  for (const heading of ['Mes cours aujourd’hui', 'Devoirs donnés', 'Annonces']) await expect(block(page, heading).getByRole('alert')).toHaveCount(0);
  await expect(pageStatus(page)).toHaveText(/^Page chargée. Ces blocs n’ont pas pu être chargés : .*Notes à finir.*À surveiller|^Page chargée. Ces blocs n’ont pas pu être chargés : .*À surveiller.*Notes à finir/);
  await expect(page.getByRole('status')).toHaveCount(1);
  await axeAtBothWidths(page);

  failing = false;
  await retry.click();
  await expect(grading.getByRole('alert')).toHaveCount(0);
  await expect(block(page, 'À surveiller').getByRole('alert')).toHaveCount(0);
  await expect(grading.getByRole('link', { name: 'Noter une classe', exact: true })).toBeVisible();
  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await axeAtBothWidths(page);
});

test('one block failing alone (the announcements) leaves the other four untouched', async ({ page }) => {
  await signInAs(page, ACCOUNTS.teacher);
  await leaveHome(page);
  await page.route('**/api/posts*', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Les annonces sont indisponibles pour le moment.' }) }),
  );
  await goInApp(page, '/enseignant');
  await expect(block(page, 'Annonces').getByRole('alert')).toContainText('Les annonces sont indisponibles');
  for (const heading of ['Mes cours aujourd’hui', 'Notes à finir', 'Devoirs donnés', 'À surveiller'])
    await expect(block(page, heading).getByRole('alert')).toHaveCount(0);
  await expect(pageStatus(page)).toHaveText('Page chargée. Le bloc « Annonces » n’a pas pu être chargé.');
  await axeAtBothWidths(page);
});

test('empty blocks invite instead of apologising; Axe-clean at 390 and 1440 px', async ({ page }) => {
  await signInAs(page, ACCOUNTS.teacher);
  await leaveHome(page);
  await page.route('**/api/timetable/occurrences*', json([]));
  await page.route('**/api/grading/pending*', json([]));
  await page.route('**/api/events/occurrences*', json([]));
  await page.route('**/api/calendar-days*', json([]));
  await page.route('**/api/posts*', json({ items: [], total: 0, page: 1, pageSize: 2 }));
  await goInApp(page, '/enseignant');

  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await expect(block(page, 'Mes cours aujourd’hui')).toContainText(/Pas de cours aujourd’hui|C’est le week-end/);
  await expect(block(page, 'Notes à finir')).toContainText('Aucune note à finir');
  await expect(block(page, 'Devoirs donnés')).toContainText('Aucun devoir à rendre');
  await expect(block(page, 'À surveiller')).toContainText('Rien à signaler');
  await expect(block(page, 'Annonces')).toContainText('Aucune annonce pour l’instant');
  for (const b of BLOCKS) await expect(block(page, b.heading).getByRole('link', { name: b.link, exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await axeAtBothWidths(page);
});
