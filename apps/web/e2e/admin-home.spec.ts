import { expect, type Locator, type Page, type Route, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { axeAtBothWidths, goInApp, signInAs, tokenOf, unique } from './structure';

/**
 * The administration's one page (/admin): seven blocks in order, each with its heading and one entry link,
 * Axe-clean at 390 and 1440 px in its ready, error and empty variants; « Préparer les bulletins » with
 * « Relancer »; the announcements page. Widths are set inside the tests, so the phone project is skipped.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside each test');
});

const BLOCKS = [
  { heading: 'À valider', link: 'Tout valider', path: '/admin/validations', h1: 'Validations' },
  { heading: 'Messages', link: 'Boîte de réception', path: '/admin/messages', h1: 'Messages' },
  { heading: 'Classes', link: 'Classes et inscriptions', path: '/admin/classes', h1: 'Classes' },
  { heading: 'Bulletins', link: 'Préparer les bulletins', path: '/admin/bulletins/preparation', h1: 'Préparer les bulletins' },
  { heading: 'Rôles', link: 'Comptes et droits', path: '/admin/utilisateurs', h1: 'Utilisateurs' },
  { heading: 'Année scolaire', link: 'Nouvelle année', path: '/admin/nouvelle-annee', h1: /Nouvelle année|Année suivante/ },
  { heading: 'Annonces', link: 'Écrire une annonce', path: '/admin/annonces', h1: 'Annonces' },
] as const;

const block = (page: Page, heading: string): Locator => page.getByRole('region', { name: heading, exact: true });
/** The page's ONE permanent live region (the blocks add none of their own). */
const pageStatus = (page: Page): Locator => page.locator('app-home-status').getByRole('status');
const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const empty = { items: [], total: 0, page: 1, pageSize: 3 };

async function openHome(page: Page): Promise<void> {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bonjour');
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
}

test('the seven blocks stack in order on a phone, three side by side from tablet width, Axe-clean', async ({ page }) => {
  const errors: string[] = [];
  const yearsRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/school-years') yearsRequests.push(r.url());
  });
  await openHome(page);
  // Classes, Bulletins and Année scolaire share one source for the school years and the term.
  expect(yearsRequests).toHaveLength(1);

  const headings = page.getByRole('main').getByRole('heading', { level: 2 });
  await expect(headings).toHaveText(BLOCKS.map((b) => b.heading));
  for (const b of BLOCKS) {
    const region = block(page, b.heading);
    await expect(region).toBeVisible();
    await expect(region.getByRole('link', { name: b.link, exact: true })).toHaveAttribute('href', b.path);
  }

  const boxes = async () => Promise.all(BLOCKS.map((b) => block(page, b.heading).boundingBox()));
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await boxes();
  for (let i = 1; i < phone.length; i++) expect(phone[i]!.y, `${BLOCKS[i]!.heading} below the block before`).toBeGreaterThan(phone[i - 1]!.y);
  for (const b of BLOCKS) {
    const box = await block(page, b.heading).getByRole('link', { name: b.link, exact: true }).boundingBox();
    expect(box!.height, `${b.link} is a touch target`).toBeGreaterThanOrEqual(44);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const [approvals, messages, classes, reports, roles, year, news] = await boxes();
  expect(Math.round(approvals!.y)).toBe(Math.round(messages!.y));
  expect(Math.round(messages!.y)).toBe(Math.round(classes!.y));
  expect(approvals!.x).toBeLessThan(messages!.x);
  expect(messages!.x).toBeLessThan(classes!.x);
  // Bulletins spans the row; Rôles, Année scolaire and Annonces share the last one.
  expect(reports!.width).toBeGreaterThan(approvals!.width * 2.5);
  expect(reports!.y).toBeGreaterThan(approvals!.y);
  expect(Math.round(roles!.y)).toBe(Math.round(year!.y));
  expect(Math.round(year!.y)).toBe(Math.round(news!.y));
  expect(roles!.y).toBeGreaterThan(reports!.y);

  await axeAtBothWidths(page);
  expect(errors).toEqual([]);
});

test('each entry link opens its detail page, and the header buttons open the account dialogs', async ({ page }) => {
  await openHome(page);
  for (const b of BLOCKS) {
    await goInApp(page, '/admin');
    await block(page, b.heading).getByRole('link', { name: b.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${b.path}$`));
    await expect(page.getByRole('heading', { level: 1, name: b.h1 })).toBeVisible();
  }

  await goInApp(page, '/admin');
  await page.getByRole('link', { name: 'Ajouter un compte' }).click();
  await expect(page).toHaveURL(/\/admin\/utilisateurs\?action=creer$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await goInApp(page, '/admin');
  await page.getByRole('link', { name: 'Importer une liste' }).click();
  await expect(page).toHaveURL(/\/admin\/utilisateurs\?action=importer$/);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a block that fails shows its own error and « Réessayer »; the page lives on; Axe-clean; the retry works', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/classes');
  let failing = true;
  await page.route('**/api/contact-messages*', (route) =>
    failing
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Les messages sont indisponibles pour le moment.' }) })
      : route.continue(),
  );
  await goInApp(page, '/admin');

  const messages = block(page, 'Messages');
  await expect(messages.getByRole('alert')).toContainText('Les messages sont indisponibles');
  const retry = messages.getByRole('button', { name: 'Réessayer' });
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const heading of ['À valider', 'Classes', 'Bulletins', 'Rôles', 'Année scolaire', 'Annonces'])
    await expect(block(page, heading).getByRole('alert')).toHaveCount(0);
  await expect(pageStatus(page)).toHaveText('Page chargée. Le bloc « Messages » n’a pas pu être chargé.');
  await expect(page.getByRole('status')).toHaveCount(1);
  await axeAtBothWidths(page);

  failing = false;
  await retry.click();
  await expect(messages.getByRole('alert')).toHaveCount(0);
  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await axeAtBothWidths(page);
});

test('a failing Bulletins block does not blank the page; its retry reloads it', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/classes');
  await page.route('**/api/periods/*/report-preparation', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Le calcul des bulletins est indisponible.' }) }),
  );
  await goInApp(page, '/admin');
  const reports = block(page, 'Bulletins');
  await expect(reports.getByRole('alert')).toContainText('Le calcul des bulletins est indisponible.');
  await expect(reports.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await expect(reports.getByRole('link', { name: 'Préparer les bulletins' })).toBeVisible();
  await expect(block(page, 'À valider').getByRole('alert')).toHaveCount(0);
  await axeAtBothWidths(page);
});

test('empty blocks invite instead of apologising; Axe-clean at 390 and 1440 px', async ({ page }) => {
  // The routes are set before signing in, so the home page (the first page of the session) reads them.
  await page.route('**/api/section-changes*', json(empty));
  await page.route('**/api/contact-messages*', json(empty));
  await page.route('**/api/classes*', json([]));
  await page.route('**/api/posts*', json(empty));
  await page.route('**/api/school-years', json([]));
  await page.route('**/api/users*', json(empty));
  await signInAs(page, ACCOUNTS.admin);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bonjour');

  await expect(pageStatus(page)).toHaveText('Page chargée.');
  await expect(block(page, 'À valider')).toContainText('Rien à valider pour l’instant');
  await expect(block(page, 'Messages')).toContainText('Aucun nouveau message');
  await expect(block(page, 'Classes')).toContainText('Aucune classe cette année');
  await expect(block(page, 'Bulletins')).toContainText('Rien à préparer pour l’instant');
  await expect(block(page, 'Année scolaire')).toContainText('Aucune année scolaire en cours');
  await expect(block(page, 'Annonces')).toContainText('Aucune annonce pour l’instant');
  // Rôles has no empty state: it says nobody is planner yet.
  await expect(block(page, 'Rôles')).toContainText('Personne n’a encore le droit');
  // The entry links stay: an empty block is still the way to its page.
  for (const b of BLOCKS) await expect(block(page, b.heading).getByRole('link', { name: b.link, exact: true })).toBeVisible();
  await axeAtBothWidths(page);
});

test('Préparer les bulletins: gaps per class, « Relancer » reminds the teachers once, Axe-clean', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/bulletins/preparation');
  await expect(page.getByRole('heading', { level: 1, name: 'Préparer les bulletins' })).toBeVisible();
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).not.toHaveCount(1);
  // The demo year has unfinished subjects: a class row names the subject and its teacher.
  await expect(table.getByText(/notes? (saisies?|à publier)|aucune note saisie/).first()).toBeVisible();
  await axeAtBothWidths(page);

  const all = page.getByRole('button', { name: 'Relancer tous les enseignants en retard' });
  await expect(all).toBeEnabled();
  await all.click();
  const status = page.getByRole('status').filter({ hasText: /relancé/ });
  await expect(status).toBeVisible();
  // A second click does not nag anyone again.
  await all.click();
  await expect(page.getByRole('status')).toContainText('déjà été relancés il y a moins de 12 heures');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await axeAtBothWidths(page);
});

test('Préparer les bulletins: a refused reminder and a failed load say what happened', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/classes');
  await page.route('**/api/periods/*/report-preparation/reminders', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ statusCode: 429, message: 'Trop de demandes, réessayez dans une minute.' }) }),
  );
  await goInApp(page, '/admin/bulletins/preparation');
  await page.getByRole('button', { name: 'Relancer tous les enseignants en retard' }).click();
  await expect(page.getByRole('alert')).toContainText('Les enseignants n’ont pas été relancés. Trop de demandes');
  await axeAtBothWidths(page);

  await page.route('**/api/periods/*/report-preparation', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Le calcul des bulletins est indisponible.' }) }),
  );
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: 'indisponible' })).toBeVisible();
  await axeAtBothWidths(page);
});

test('Préparer les bulletins: a term with no class shows its empty state', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/classes');
  await page.route('**/api/periods/*/report-preparation', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...body, classes: [], classCount: 0, completeClassCount: 0, subjectCount: 0, readySubjectCount: 0, lateTeacherCount: 0 } });
  });
  await goInApp(page, '/admin/bulletins/preparation');
  await expect(page.getByText('Ce trimestre ne concerne aucune classe pour l’instant.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Relancer tous les enseignants en retard' })).toBeDisabled();
  await axeAtBothWidths(page);
});

test('Annonces: publish one for the whole school, read it on the home page, delete it', async ({ page }) => {
  const title = unique('Annonce');
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/annonces');
  await expect(page.getByRole('heading', { level: 1, name: 'Annonces' })).toBeVisible();
  await expect(page.locator('.loading-line')).toHaveCount(0, { timeout: 30_000 });
  await axeAtBothWidths(page);

  await page.getByLabel('Titre').fill(title);
  await page.getByLabel('Message').fill('Réunion de rentrée jeudi à 17 h.');
  await page.getByRole('button', { name: 'Publier l’annonce' }).click();
  await expect(page.getByText(`L’annonce « ${title} » est publiée.`)).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: title })).toBeVisible();

  await goInApp(page, '/admin');
  await expect(block(page, 'Annonces').getByRole('heading', { level: 3, name: title })).toBeVisible();

  await goInApp(page, '/admin/annonces');
  await page.getByRole('button', { name: new RegExp(`Supprimer l’annonce « ${title} »`) }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText(`L’annonce « ${title} » est supprimée.`)).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: title })).toHaveCount(0);
  await axeAtBothWidths(page);
});

test('Annonces: an empty title is refused with a message that says how to fix it', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/annonces');
  await page.getByRole('button', { name: 'Publier l’annonce' }).click();
  await expect(page.getByText('Donnez un titre à l’annonce.')).toBeVisible();
  await expect(page.getByText('Écrivez le message de l’annonce.')).toBeVisible();
  await axeAtBothWidths(page);
});

test('a planner is sent to the structure screens; the API refuses the preparation to a teacher', async ({ page, request }) => {
  await signInAs(page, ACCOUNTS.planner);
  await goInApp(page, '/admin').catch(() => undefined);
  await expect(page).toHaveURL(/\/admin\/matieres$/);
  await page.context().clearCookies();
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  // The API refuses the preparation to a teacher too.
  const res = await request.get('/api/periods/00000000-0000-4000-8000-000000000000/report-preparation', { headers: teacher });
  expect(res.status()).toBe(403);
});
