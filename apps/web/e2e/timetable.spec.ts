import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import { ACCOUNTS, type Account } from './accounts';

/** The timetable screens: week editor (admin), « Mon emploi du temps » (teacher), student week. */

async function signInTo(page: Page, account: Account, path: string): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'));
  await page.locator('.app-bar').waitFor();
  // In-app navigation keeps the in-memory access token.
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** An API session for cleaning up what a test created (the token never leaves this process). */
async function adminApi(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: ACCOUNTS.admin });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    get: async <T>(url: string) => (await (await request.get(url, { headers })).json()) as T,
    del: (url: string) => request.delete(url, { headers }),
  };
}

/**
 * Saves a dialog; when the API answers with warnings (a room too small for a class that grew, say), accepts
 * each with a reason, as a person would, and saves again.
 */
async function saveAccepting(page: Page, dialog: ReturnType<Page['getByRole']>, button: string): Promise<void> {
  await dialog.getByRole('button', { name: button }).click();
  const accept = dialog.getByRole('button', { name: 'Enregistrer avec ces avertissements' });
  const done = page.locator('.alert--success').filter({ hasText: /nregistr/ });
  await expect(accept.or(done)).toBeVisible();
  if (await accept.isVisible()) {
    const reasons = dialog.getByLabel(/^Motif : /);
    for (let i = 0; i < (await reasons.count()); i++) await reasons.nth(i).fill('Accepté pour le test');
    await accept.click();
  }
}

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Removes the slots and exceptions the tests added (they all carry the 17:00 hour or the test reason). */
async function cleanUp(request: APIRequestContext): Promise<void> {
  const api = await adminApi(request);
  const classes = await api.get<{ id: string }[]>('/api/classes');
  for (const c of classes) {
    const page = await api.get<{ items: { id: string; startTime: string; validFrom: string }[] }>(
      `/api/timetable/slots?classId=${c.id}&pageSize=100`,
    );
    for (const s of page.items.filter((i) => i.startTime === '17:00')) await api.del(`/api/timetable/slots/${s.id}?scope=all`);
    const from = iso(0);
    const sessions = await api.get<{ exceptionId: string | null; reason: string }[]>(
      `/api/timetable/occurrences?classId=${c.id}&from=${from}&to=${iso(55)}`,
    );
    for (const o of sessions.filter((s) => s.exceptionId && s.reason === 'Test Playwright'))
      await api.del(`/api/timetable/exceptions/${o.exceptionId}`);
  }
}

test.describe('timetable', () => {
  test.afterEach(async ({ request }) => {
    await cleanUp(request);
  });

  test('the admin builds a timetable, hits a room conflict and fixes it with a suggested room', async ({ page, request }, info) => {
    test.skip(info.project.name === 'phone', 'The week editor is a desktop screen.');
    await cleanUp(request);
    await signInTo(page, ACCOUNTS.admin, '/admin/emploi-du-temps');
    await expect(page.getByRole('heading', { level: 1, name: 'Emploi du temps' })).toBeVisible();
    await expect(page.getByRole('grid')).toBeVisible();

    const addSlot = async (className: string, subject: string) => {
      await page.getByLabel('Classe', { exact: true }).first().selectOption({ label: className });
      await expect(page.getByRole('grid')).toHaveAttribute('aria-label', new RegExp(className.split(' (')[0]!));
      await page.getByRole('button', { name: 'Ajouter une séance' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Ajouter une séance' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Classe').selectOption({ label: className });
      await dialog.getByLabel('Matière').selectOption({ label: subject });
      await dialog.getByLabel('Salle').selectOption({ label: 'Salle 14' });
      await dialog.getByLabel('Début').fill('17:00');
      await dialog.getByLabel('Fin').fill('18:00');
      return dialog;
    };

    // First séance: Seconde (Bac français), Humanités, Sunday 17:00, Salle 14.
    const first = await addSlot('Seconde (Bac français)', 'Humanités, littérature et philosophie');
    await saveAccepting(page, first, 'Ajouter la séance');
    await expect(page.locator('.alert--success').filter({ hasText: /nregistr/ })).toBeVisible();
    await expect(page.getByRole('grid')).toContainText('Humanités, littérature et philosophie');

    // Second: another class, another teacher, the same room and hour: refused, with the conflict named.
    const second = await addSlot('1re secondaire (Bac nationale)', 'Psychologie et sociologie');
    await second.getByRole('button', { name: 'Ajouter la séance' }).click();
    await expect(second.getByRole('alert').filter({ hasText: 'Salle 14 est déjà occupée' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Conflits \(1\)/ })).toBeVisible();
    await expectNoAxeViolations(page);

    // The suggestion: a room that is free at that time.
    const suggestions = second.getByRole('list', { name: 'Salles libres à ce moment-là' });
    await expect(suggestions).toBeVisible();
    await suggestions.getByRole('button').first().click();
    await saveAccepting(page, second, 'Ajouter la séance');
    await expect(page.locator('.alert--success').filter({ hasText: /nregistr/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Conflits \(\d+\)/ })).toBeVisible();
  });

  test('the admin edits the grid with the keyboard: arrows, Enter opens the cell, Escape returns to it', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'The week editor is a desktop screen.');
    await signInTo(page, ACCOUNTS.admin, '/admin/emploi-du-temps');
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible();
    const first = grid.getByRole('gridcell').first();
    await first.focus();
    await expect(first).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('ArrowRight');
    await expect(grid.getByRole('gridcell').nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(grid.getByRole('gridcell').nth(6)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(grid.getByRole('gridcell').nth(5)).toBeFocused();
    await page.keyboard.press('Control+End');
    await expect(grid.getByRole('gridcell').last()).toBeFocused();
    await page.keyboard.press('Control+Home');
    await expect(first).toBeFocused();
    // Enter opens the cell's dialog; Escape closes it and focus comes back to the cell.
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Ajouter une séance ici' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(first).toBeFocused();
  });

  test('the admin cancels one session; the student sees it struck through with the reason', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'The week editor is a desktop screen.');
    await signInTo(page, ACCOUNTS.admin, '/admin/emploi-du-temps');
    const grid = page.getByRole('grid');
    // The first class (the student's), next week at the latest: a week that has sessions.
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    const cell = grid.getByRole('gridcell').filter({ has: page.locator('.cs') }).first();
    await expect(cell).toBeVisible();
    await cell.click();
    const cellDialog = page.getByRole('dialog');
    await cellDialog.getByRole('button', { name: 'Annuler la séance…' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Modifier la séance' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Cette séance' })).toBeChecked();
    await dialog.getByLabel('Motif').fill('Test Playwright');
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.locator('.alert--success').filter({ hasText: /nregistr/ })).toBeVisible();
    await expect(grid.locator('.cs--struck').first()).toBeVisible();

    // The student of that class: next week, the same session, struck through, with the word and the reason.
    await page.context().clearCookies();
    await page.goto('/');
    await signInTo(page, ACCOUNTS.student, '/eleve/emploi-du-temps');
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    const struck = page.locator('.session--struck:visible').first();
    await expect(struck).toBeVisible();
    await expect(struck).toContainText('Annulée');
    await expect(struck).toContainText('Motif : Test Playwright');
    const decoration = await struck.locator('.session__name').evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(decoration).toBe('line-through');
  });

  test('a teacher changes the room of one session with the three-scope dialog and a free room', async ({ page }) => {
    await signInTo(page, ACCOUNTS.teacher, '/enseignant/emploi-du-temps');
    await expect(page.getByRole('heading', { level: 1, name: 'Mon emploi du temps' })).toBeVisible();
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    const edit = page.getByRole('button', { name: /^Modifier la séance/ }).first();
    await expect(edit).toBeVisible();
    await edit.click();
    const dialog = page.getByRole('dialog', { name: 'Modifier la séance' });
    await expect(dialog).toBeVisible();
    // The three scopes; the series ones belong to the administration.
    await expect(dialog.getByRole('radio', { name: 'Cette séance' })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: 'Celle-ci et les suivantes' })).toBeDisabled();
    await expect(dialog.getByRole('radio', { name: 'Toute la série' })).toBeDisabled();
    await dialog.getByRole('radio', { name: 'Changer de salle' }).check();
    const rooms = dialog.getByRole('list', { name: 'Salles libres à ce moment-là' });
    await expect(rooms).toBeVisible();
    await rooms.getByRole('button').first().click();
    await dialog.getByLabel('Motif').fill('Test Playwright');
    await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.locator('.alert--success').filter({ hasText: 'La séance a été modifiée' })).toBeVisible();
    await expect(page.getByText('Salle changée').first()).toBeVisible();
    // Back to the plan.
    await page.getByRole('button', { name: /^Rétablir la séance/ }).first().click();
    await expect(page.locator('.alert--success').filter({ hasText: 'rétablie' })).toBeVisible();
  });

  for (const width of [390, 1440]) {
    test(`Axe finds nothing on the timetable screens at ${width} px`, async ({ page }, info) => {
      test.skip(info.project.name === 'phone' && width === 1440, 'Phone project runs the 390 px pass only.');
      await page.setViewportSize({ width, height: 900 });

      await signInTo(page, ACCOUNTS.student, '/eleve/emploi-du-temps');
      await expect(page.getByRole('heading', { level: 1, name: 'Emploi du temps' })).toBeVisible();
      await expect(page.locator('.tt-days, .tt-table').first()).toBeAttached();
      await expectNoAxeViolations(page);

      await page.context().clearCookies();
      await page.goto('/');
      await signInTo(page, ACCOUNTS.teacher, '/enseignant/emploi-du-temps');
      await page.getByRole('button', { name: 'Semaine suivante' }).click();
      const edit = page.getByRole('button', { name: /^Modifier la séance/ }).first();
      await expect(edit).toBeVisible();
      await expectNoAxeViolations(page);
      await edit.click();
      const teacherDialog = page.getByRole('dialog', { name: 'Modifier la séance' });
      await teacherDialog.getByRole('radio', { name: 'Changer de salle' }).check();
      await expect(teacherDialog.getByRole('list', { name: 'Salles libres à ce moment-là' })).toBeVisible();
      await expectNoAxeViolations(page);
      await page.keyboard.press('Escape');
      await expect(teacherDialog).toBeHidden();

      await page.context().clearCookies();
      await page.goto('/');
      await signInTo(page, ACCOUNTS.admin, '/admin/emploi-du-temps');
      await expect(page.getByRole('grid')).toBeVisible();
      await expectNoAxeViolations(page);
      // The cell dialog, the session dialog with its three scopes, the new-slot dialog.
      await page.getByRole('button', { name: 'Semaine suivante' }).click();
      await page.getByRole('grid').getByRole('gridcell').filter({ has: page.locator('.cs') }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoAxeViolations(page);
      await page.getByRole('button', { name: 'Modifier…' }).first().click();
      const sessionDialog = page.getByRole('dialog', { name: 'Modifier la séance' });
      await expect(sessionDialog.getByRole('radio', { name: 'Toute la série' })).toBeEnabled();
      await sessionDialog.getByRole('radio', { name: 'Toute la série' }).check();
      await expect(sessionDialog.getByLabel('Rythme', { exact: true })).toBeVisible();
      await expectNoAxeViolations(page);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Ajouter une séance' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Ajouter une séance' })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});
