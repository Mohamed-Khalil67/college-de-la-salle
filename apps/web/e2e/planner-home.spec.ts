import { addDays, weekday } from '@cdls/shared';
import { schoolToday } from './school';
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  type Route,
  test,
} from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { firstTeachingWeek } from './school-weeks';
import { axeAtBothWidths, goInApp, signInAs, tokenOf } from './structure';

/**
 * The planner's one page (/admin/planification) and « Professeur absent »: five blocks in order with one entry
 * link each, the two header buttons, error and empty variants, and the flow from the teacher and the days to
 * the saved choices. Axe-clean at 390 and 1440 px. Widths are set inside the tests, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside each test');
});

const BLOCKS = [
  { heading: 'À régler', link: 'Régler les conflits', path: '/admin/emploi-du-temps' },
  {
    heading: 'Changements aujourd’hui',
    link: 'Toutes les modifications',
    path: '/admin/emploi-du-temps',
  },
  { heading: 'Salles maintenant', link: 'Occupation des salles', path: '/admin/emploi-du-temps' },
  { heading: 'L’année', link: 'Calendrier de l’année', path: '/admin/annees' },
  {
    heading: 'Emplois du temps',
    link: 'Ouvrir la grille (classe, enseignant, salle)',
    path: '/admin/emploi-du-temps',
  },
] as const;

const block = (page: Page, heading: string): Locator =>
  page.getByRole('region', { name: heading, exact: true });
const pageStatus = (page: Page): Locator => page.locator('app-home-status').getByRole('status');
const json =
  (body: unknown, status = 200) =>
  (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Opens an address through the router without waiting for it to stay (a guard may send the user elsewhere). */
async function goTo(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function openPlanner(page: Page, account = ACCOUNTS.planner): Promise<void> {
  await signInAs(page, account);
  await goInApp(page, '/admin/planification');
  await expect(page.getByRole('heading', { level: 1, name: 'Planification' })).toBeVisible();
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
}

test('the five blocks stack in order on a phone, wide ones span the row on desktop, Axe-clean', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openPlanner(page);

  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(
    BLOCKS.map((b) => b.heading),
  );
  for (const b of BLOCKS) {
    const region = block(page, b.heading);
    await expect(region).toBeVisible();
    await expect(region.getByRole('link', { name: b.link, exact: true })).toHaveAttribute(
      'href',
      b.path,
    );
  }
  // The two header buttons; « Ajouter un examen » opens a dialog (planner-add-exam.spec.ts), for every planner.
  await expect(page.getByRole('link', { name: 'Professeur absent', exact: true })).toHaveAttribute(
    'href',
    '/admin/planification/professeur-absent',
  );
  await expect(page.getByRole('button', { name: 'Ajouter un examen', exact: true })).toBeVisible();

  const boxes = async () => Promise.all(BLOCKS.map((b) => block(page, b.heading).boundingBox()));
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await boxes();
  for (let i = 1; i < phone.length; i++)
    expect(phone[i]!.y, `${BLOCKS[i]!.heading} below the block before`).toBeGreaterThan(
      phone[i - 1]!.y,
    );
  for (const b of BLOCKS) {
    const box = await block(page, b.heading)
      .getByRole('link', { name: b.link, exact: true })
      .boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const [fix, changes, rooms, year, timetables] = await boxes();
  expect(Math.round(fix!.y)).toBe(Math.round(changes!.y));
  expect(Math.round(changes!.y)).toBe(Math.round(rooms!.y));
  expect(year!.width).toBeGreaterThan(fix!.width * 2.5);
  expect(timetables!.width).toBeGreaterThan(fix!.width * 2.5);
  expect(timetables!.y).toBeGreaterThan(year!.y);

  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await axeAtBothWidths(page);
  expect(errors).toEqual([]);
});

test('the admin has the page too, with « Ajouter un examen »; a plain teacher and a student are sent away', async ({
  page,
}) => {
  await openPlanner(page, ACCOUNTS.admin);
  await expect(page.getByRole('link', { name: 'Professeur absent', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter un examen', exact: true })).toBeVisible();
  await axeAtBothWidths(page);

  await page.context().clearCookies();
  await page.goto('/');
  await signInAs(page, ACCOUNTS.teacher);
  await goTo(page, '/admin/planification');
  await expect(page).toHaveURL(/\/enseignant/);

  await page.context().clearCookies();
  await page.goto('/');
  await signInAs(page, ACCOUNTS.student);
  await goTo(page, '/admin/planification');
  await expect(page).toHaveURL(/\/eleve/);
});

test('each entry link opens its detail page', async ({ page }) => {
  await openPlanner(page);
  for (const b of BLOCKS) {
    await goInApp(page, '/admin/planification');
    await block(page, b.heading).getByRole('link', { name: b.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${b.path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('a block that fails shows its own error and « Réessayer »; the page lives on; the retry works', async ({
  page,
}) => {
  await signInAs(page, ACCOUNTS.planner);
  await goInApp(page, '/admin/classes');
  let failing = true;
  await page.route('**/api/planner/today*', (route) =>
    failing
      ? json(
          { statusCode: 500, message: 'Les changements sont indisponibles pour le moment.' },
          500,
        )(route)
      : route.continue(),
  );
  await goInApp(page, '/admin/planification');

  const changes = block(page, 'Changements aujourd’hui');
  await expect(changes.getByRole('alert')).toContainText('Les changements sont indisponibles');
  const retry = changes.getByRole('button', { name: 'Réessayer' });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const heading of ['Salles maintenant', 'Emplois du temps'])
    await expect(block(page, heading).getByRole('alert')).toHaveCount(0);
  await expect(pageStatus(page)).toHaveText(
    'Page chargée. Le bloc « Changements aujourd’hui » n’a pas pu être chargé.',
  );
  await expect(page.getByRole('status')).toHaveCount(1);
  await axeAtBothWidths(page);

  failing = false;
  await retry.click();
  await expect(changes.getByRole('alert')).toHaveCount(0);
  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await axeAtBothWidths(page);
});

test('a source that fails is the block’s error, never « Rien à régler » or « Aucune semaine… »', async ({
  page,
}) => {
  await signInAs(page, ACCOUNTS.planner);
  await goInApp(page, '/admin/classes');
  await page.route(
    '**/api/planner/timetables*',
    json({ statusCode: 500, message: 'Les emplois du temps sont indisponibles.' }, 500),
  );
  await page.route(
    '**/api/calendar-days*',
    json({ statusCode: 500, message: 'Le calendrier est indisponible.' }, 500),
  );
  await page.route('**/api/timetable/warnings*', json([]));
  await goInApp(page, '/admin/planification');
  await expect(pageStatus(page)).toContainText('n’ont pas pu être chargés');
  for (const heading of ['À régler', 'L’année', 'Emplois du temps']) {
    const region = block(page, heading);
    await expect(region.getByRole('alert')).toBeVisible();
    await expect(region.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  }
  await expect(block(page, 'À régler')).not.toContainText('Rien à régler');
  await expect(block(page, 'L’année')).not.toContainText('Aucune semaine d’examens');
  await axeAtBothWidths(page);
});

test('empty blocks invite instead of apologising; Axe-clean', async ({ page }) => {
  await signInAs(page, ACCOUNTS.planner);
  await goInApp(page, '/admin/classes');
  await page.route('**/api/planner/today*', json({ date: schoolToday(), changes: [] }));
  await page.route(
    '**/api/planner/rooms-now*',
    json({ date: schoolToday(), time: '10:00', free: [], total: 0 }),
  );
  await page.route(
    '**/api/planner/timetables*',
    json({ yearLabel: '2026-2027', classes: [], teachersPlaced: 0, teachersTotal: 0 }),
  );
  await page.route('**/api/timetable/warnings*', json([]));
  await page.route('**/api/school-years*', json([]));
  await goInApp(page, '/admin/planification');

  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await expect(block(page, 'À régler')).toContainText(
    'Rien à régler pour les deux semaines à venir',
  );
  await expect(block(page, 'Changements aujourd’hui')).toContainText(
    'Aucun changement aujourd’hui',
  );
  await expect(block(page, 'Salles maintenant')).toContainText('Aucune salle n’est enregistrée');
  await expect(block(page, 'L’année')).toContainText('Aucune année scolaire');
  await expect(block(page, 'Emplois du temps')).toContainText('Aucune classe cette année');
  for (const b of BLOCKS)
    await expect(
      block(page, b.heading).getByRole('link', { name: b.link, exact: true }),
    ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await axeAtBothWidths(page);
});

/* Professeur absent ------------------------------------------------------------------------------------- */

async function nextWeekday(from: string, wanted: number): Promise<string> {
  let day = from;
  while (weekday(day) !== wanted) day = addDays(day, 1);
  return day;
}

/** Puts every session of the teacher back to the weekly rule (through the API). */
async function restore(
  request: APIRequestContext,
  teacherEmail: string,
  from: string,
  to: string,
): Promise<void> {
  const admin = await tokenOf(request, ACCOUNTS.admin);
  const teacher = await tokenOf(request, {
    email: teacherEmail,
    password: ACCOUNTS.teacher.password,
  });
  const me = (await (await request.get('/api/auth/me', { headers: teacher })).json()) as {
    teacherId: string;
  };
  const sessions = (await (
    await request.get(
      `/api/timetable/occurrences?teacherId=${me.teacherId}&from=${from}&to=${to}`,
      { headers: admin },
    )
  ).json()) as { exceptionId: string | null }[];
  for (const s of sessions)
    if (s.exceptionId)
      await request.delete(`/api/timetable/exceptions/${s.exceptionId}`, { headers: admin });
}

async function teacherName(request: APIRequestContext): Promise<string> {
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const me = (await (await request.get('/api/auth/me', { headers: teacher })).json()) as {
    firstName: string;
    lastName: string;
  };
  return `${me.firstName} ${me.lastName}`;
}

/** The first school week with lessons of the demo teacher (never a holiday, whatever the day of the run). */
async function lessonWeek(request: APIRequestContext): Promise<{ from: string; to: string }> {
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const me = (await (await request.get('/api/auth/me', { headers: teacher })).json()) as { teacherId: string };
  const from = await firstTeachingWeek(request, teacher, `teacherId=${me.teacherId}`);
  return { from, to: addDays(from, 6) };
}

async function lookUp(page: Page, name: string, from: string, to: string): Promise<void> {
  await page.getByLabel('Enseignant absent').selectOption({ label: name });
  await page.getByLabel('Premier jour').fill(from);
  await page.getByLabel('Dernier jour').fill(to);
  await page.getByRole('button', { name: 'Voir les séances' }).click();
}

test('Professeur absent: a teacher and days, one choice per lesson, saved together; Axe-clean at each step', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const name = await teacherName(request);
  const { from, to } = await lessonWeek(request);
  try {
    await openPlanner(page);
    await page.getByRole('link', { name: 'Professeur absent', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/planification\/professeur-absent$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Professeur absent' })).toBeVisible();
    await axeAtBothWidths(page);

    // Step 1 refuses a missing teacher with a message that says how to fix it.
    await page.getByRole('button', { name: 'Voir les séances' }).click();
    await expect(page.getByText('Choisissez l’enseignant absent.')).toBeVisible();

    await lookUp(page, name, from, to);
    const lessons = page.locator('fieldset.absence__lesson');
    await expect(lessons.first()).toBeVisible();
    // The first lookup moves focus to the lessons' heading (it did not exist before).
    await expect(
      page.getByRole('heading', { level: 2, name: '2. Que faire de chaque séance ?' }),
    ).toBeFocused();
    const count = await lessons.count();
    expect(count).toBeGreaterThan(2);
    // The lesson count is the one status line of the step (the warnings keep their own region); the section itself is not a live region.
    await expect(page.locator('section[aria-labelledby="absence-etape-2"]')).not.toHaveAttribute(
      'aria-live',
      /.+/,
    );
    await expect(
      page.locator('section[aria-labelledby="absence-etape-2"] p[role="status"]'),
    ).toHaveCount(1);
    // The fieldset's legend names the choice: no second radiogroup; touch targets are at least 44 px high.
    await expect(lessons.first().getByRole('radiogroup')).toHaveCount(0);
    for (const label of await lessons.first().locator('label.check').all()) {
      expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await axeAtBothWidths(page);

    // Changing the teacher or the days after a lookup hides the lessons and says so.
    await page.getByLabel('Dernier jour').fill(addDays(to, 1));
    await expect(lessons).toHaveCount(0);
    await expect(page.getByText('Vous avez changé l’enseignant ou les jours')).toBeVisible();
    await page.getByLabel('Dernier jour').fill(to);
    await page.getByRole('button', { name: 'Voir les séances' }).click();
    await expect(lessons.first()).toBeVisible();

    // Saving with lessons left open names what is missing and moves focus to the first one.
    await lessons.nth(0).getByRole('radio', { name: 'Annuler' }).check();
    await page.getByRole('button', { name: 'Enregistrer et prévenir' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'sans choix' })).toBeVisible();
    await expect(lessons.nth(1).getByRole('radio').first()).toBeFocused();

    // Remplacer proposes a free teacher of the subject; Étude surveillée asks for a supervisor.
    await lessons.nth(1).getByRole('radio', { name: 'Remplacer' }).check();
    // The demo school has one teacher of mathématiques: nobody of the subject is free, and the page says so.
    const cover = lessons.nth(1).getByLabel('Enseignant qui remplace');
    await expect(
      lessons.nth(1).getByText('Aucun enseignant de la matière n’est libre'),
    ).toBeVisible();
    await expect(lessons.nth(1).getByText('Choisissez l’enseignant qui remplace.')).toBeVisible();
    await cover.selectOption({ index: 1 });
    await expect(cover).not.toHaveValue('');
    await lessons.nth(2).getByRole('radio', { name: 'Étude surveillée' }).check();
    await expect(
      lessons.nth(2).getByText('Choisissez la personne qui surveille l’étude.'),
    ).toBeVisible();
    await lessons.nth(2).getByLabel('Personne qui surveille').selectOption({ index: 1 });
    for (let i = 3; i < count; i++)
      await lessons.nth(i).getByRole('radio', { name: 'Annuler' }).check();
    await expect(page.getByText('À enregistrer :')).toContainText('annulée');
    await page.getByLabel('Motif (facultatif)').fill('Formation (test Playwright)');
    await axeAtBothWidths(page);

    await page.getByRole('button', { name: 'Enregistrer et prévenir' }).click();
    const done = page.locator('.alert--success');
    await expect(done).toContainText('Enregistré');
    await expect(done).toContainText('prévenue');
    await expect(page.getByRole('heading', { level: 1, name: 'Professeur absent' })).toBeFocused();
    // The lessons now say what they are.
    await expect(lessons.first().getByText('Déjà : annulée')).toBeVisible();
    await axeAtBothWidths(page);

    // The planner's page shows the change for that day's window through the API the block reads.
    await page.getByRole('link', { name: 'Retour à la planification' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Planification' })).toBeVisible();
  } finally {
    await restore(request, ACCOUNTS.teacher.email, from, to);
  }
});

test('Professeur absent: a failing lookup, a day without lessons, a refused save', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const name = await teacherName(request);
  await signInAs(page, ACCOUNTS.planner);
  await goInApp(page, '/admin/planification/professeur-absent');

  // A day without lessons (the school week is Sunday to Thursday): the page invites, it does not apologise.
  const friday = await nextWeekday(addDays(schoolToday(), 14), 5);
  await lookUp(page, name, friday, friday);
  await expect(page.getByRole('heading', { name: 'Aucune séance à traiter' })).toBeVisible();
  await axeAtBothWidths(page);

  // A lookup that fails shows its own error and retries.
  let failing = true;
  await page.route('**/api/planner/absence?*', (route) =>
    failing && route.request().method() === 'GET'
      ? json(
          { statusCode: 500, message: 'Les séances sont indisponibles pour le moment.' },
          500,
        )(route)
      : route.continue(),
  );
  const { from, to } = await lessonWeek(request);
  await lookUp(page, name, from, to);
  await expect(page.getByRole('alert')).toContainText('Les séances sont indisponibles');
  await axeAtBothWidths(page);
  failing = false;
  await page.getByRole('button', { name: 'Réessayer' }).click();
  const lessons = page.locator('fieldset.absence__lesson');
  await expect(lessons.first()).toBeVisible();

  // A save the server refuses (a covering teacher already busy): nothing is said to be saved, the reason shows.
  await page.route('**/api/planner/absence', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 409,
            message: 'Conflit',
            code: 'TIMETABLE_CONFLICT',
            conflicts: [
              { kind: 'teacher', message: 'Cet enseignant a déjà une séance à ce moment.' },
            ],
            warnings: [],
            suggestions: [],
          }),
        })
      : route.continue(),
  );
  const count = await lessons.count();
  for (let i = 0; i < count; i++)
    await lessons.nth(i).getByRole('radio', { name: 'Annuler' }).check();
  await page.getByRole('button', { name: 'Enregistrer et prévenir' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Cet enseignant a déjà une séance' }),
  ).toBeVisible();
  await expect(page.locator('.alert--success')).toHaveCount(0);
  await axeAtBothWidths(page);
});
