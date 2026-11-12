import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type { SessionResponse } from '@cdls/shared';
import { ACCOUNTS, type Account } from './accounts';

/**
 * « Noter » (quick grading): the teacher creates a note from « Saisie des notes », types the marks with the
 * keyboard, finishes later, reopens the draft, publishes, and the student sees the grade. At 390 px (phone
 * project) and 1440 px (desktop project), with 0 Axe violations on each step.
 */

async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'));
  await page.locator('.app-bar').waitFor();
}

/** In-app navigation keeps the in-memory session. */
async function goInApp(page: Page, target: string): Promise<void> {
  await page.evaluate((to) => {
    history.pushState(null, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
  }, target);
  await page.waitForURL((url) => `${url.pathname}${url.search}` === target);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('a teacher grades a class straight away and the student sees the grade once published', async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const phone = info.project.name === 'phone';
  await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 900 });

  // The demo student's class and name, from their own session.
  const login = await request.post('/api/auth/login', { data: ACCOUNTS.student });
  expect(login.ok()).toBe(true);
  const pupil = ((await login.json()) as SessionResponse).user;
  expect(pupil.classId).toBeTruthy();
  const pupilName = `${pupil.firstName} ${pupil.lastName}`;
  const title = `Interro éclair ${info.project.name} ${Date.now() % 100_000}`;

  // « Saisie des notes » leads to « Noter ».
  await signIn(page, ACCOUNTS.teacher);
  await goInApp(page, '/enseignant/notes');
  await page.getByRole('link', { name: 'Nouvelle note' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Noter' })).toBeVisible();
  await goInApp(page, `/enseignant/noter?classe=${pupil.classId}&matiere=mathematiques`);

  // Step 1: « Quelle note ? »
  await expect(page.getByRole('heading', { level: 2, name: 'Quelle note ?' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'À finir' })).toBeVisible();
  await expect(page.locator('.loading-line')).toHaveCount(0);
  await expectNoAxeViolations(page);

  // An empty name is refused with a sentence that says how to fix it.
  await page.getByRole('button', { name: 'Commencer la saisie' }).click();
  await expect(page.getByText('Donnez un nom à la note')).toBeVisible();

  await page.getByLabel('Nom').fill(title);
  await page.getByLabel('Coefficient').fill('2');
  await page.getByRole('button', { name: 'Commencer la saisie' }).click();

  // Step 2: focus moves to the note's heading; the marks are typed with the keyboard only.
  const heading = page.getByRole('heading', { level: 2, name: title });
  await expect(heading).toBeFocused();
  await expect(page.getByText('Étape 2 sur 2')).toBeVisible();
  const marks = page.locator('input.grade-input');
  await expect(marks.first()).toBeVisible();
  const labels = await marks.evaluateAll((inputs) => inputs.map((i) => i.getAttribute('aria-label') ?? ''));
  const pupilRow = labels.indexOf(`Note, ${pupilName}`);
  expect(pupilRow).toBeGreaterThanOrEqual(0);
  const valueFor = (row: number) => (row === pupilRow ? '14' : row % 2 ? '15' : '12,5');

  // Every mark typed from the keyboard: Enter goes to the next student, then to « Publier aux élèves ».
  await marks.first().focus();
  for (let row = 0; row < labels.length; row++) {
    await page.keyboard.type(valueFor(row));
    await page.keyboard.press('Enter');
    if (row + 1 < labels.length) await expect(marks.nth(row + 1)).toBeFocused();
  }
  await expect(page.getByRole('button', { name: 'Publier aux élèves' })).toBeFocused();
  const pupilMark = marks.nth(pupilRow);
  await page.getByLabel(`Commentaire, ${pupilName}`, { exact: true }).fill('Bon travail');

  // Autosave, announced politely.
  const status = page.getByRole('status').filter({ hasText: /Enregistr/ });
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toContainText(`Enregistré · ${labels.length} / ${labels.length} · moyenne`, { timeout: 10_000 });
  await expectNoAxeViolations(page);

  // « Finir plus tard »: back to step 1, the draft waits in « À finir ».
  await page.getByRole('button', { name: 'Finir plus tard' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Quelle note ?' })).toBeFocused();
  await expect(page.getByText(`« ${title} » est enregistrée`)).toBeVisible();
  const draft = page.getByRole('button', { name: new RegExp(title) });
  await expect(draft).toContainText('brouillon');
  await draft.focus();
  await page.keyboard.press('Enter');

  // Reopened with what was typed.
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeFocused();
  await expect(pupilMark).toHaveValue('14');
  await expect(marks.nth(pupilRow === 0 ? 1 : 0)).toHaveValue(valueFor(pupilRow === 0 ? 1 : 0));
  await expect(page.getByLabel(`Commentaire, ${pupilName}`, { exact: true })).toHaveValue('Bon travail');

  // « Publier aux élèves », after a confirmation.
  await page.getByRole('button', { name: 'Publier aux élèves' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publier aux élèves ?' });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Publier aux élèves' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `« ${title} » est publiée` })).toBeFocused();
  await expectNoAxeViolations(page);

  // The student sees the grade.
  await page.context().clearCookies();
  await signIn(page, ACCOUNTS.student);
  await goInApp(page, '/eleve/notes');
  await expect(page.getByText(title).first()).toBeVisible();
});
