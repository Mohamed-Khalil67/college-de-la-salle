import { addDays, type EventDto, type SchoolYearDto } from '@cdls/shared';
import { schoolToday } from './school';
import { expect, type Page, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { expectNoAxeViolations, goInApp, signInAs, tokenOf, unique } from './structure';

/**
 * « Ajouter un examen » on the planner's page, as an admin account (no teacher profile): the dialog's form,
 * its refusals in words, a saved exam shown in a status line, and a clash of the class refused (nothing saved).
 * Axe at 390 and 1440 px with the dialog open. Widths are set inside the test, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside the test');
});

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Ajouter un examen' });

test('the admin adds an exam for a class, a clash is refused, Axe-clean at both widths', async ({ page, request }) => {
  const headers = await tokenOf(request, ACCOUNTS.admin);
  // A Friday evening in a period of the current year: no lesson of the demo timetable can clash with it.
  const years = (await (await request.get('/api/school-years', { headers })).json()) as SchoolYearDto[];
  const periods = years.find((y) => y.isCurrent)?.periods ?? [];
  let friday = addDays(schoolToday(), 7);
  while (new Date(`${friday}T00:00:00Z`).getUTCDay() !== 5) friday = addDays(friday, 1);
  while (!periods.some((p) => p.closedAt === null && p.startsOn <= friday && friday <= p.endsOn)) friday = addDays(friday, 7);
  const title = unique('Examen test');

  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/planification');
  await expect(page.getByRole('heading', { level: 1, name: 'Planification' })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter un examen', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel('Classe')).toBeVisible();

  // The form says what is missing, in order.
  await dialog(page).getByRole('button', { name: 'Ajouter l’examen' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText(/Choisissez la classe\./);

  await dialog(page).getByLabel('Classe').selectOption({ index: 1 });
  await expect(dialog(page).getByLabel('Matière').locator('option')).not.toHaveCount(1);
  await dialog(page).getByLabel('Matière').selectOption({ index: 1 });
  await dialog(page).getByLabel('Titre').fill(title);
  await dialog(page).getByLabel('Date').fill(friday);
  await dialog(page).getByLabel('Début').fill('18:00');
  await dialog(page).getByLabel('Fin').fill('17:00');
  await dialog(page).getByRole('button', { name: 'Ajouter l’examen' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText(/doit venir après/);
  // Whether the day is an exam week is said under the date.
  await expect(dialog(page).getByText(/semaine d’examens/).first()).toBeVisible();

  for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    await expectNoAxeViolations(page);
  }

  await dialog(page).getByLabel('Fin').fill('19:00');
  await dialog(page).getByRole('button', { name: 'Ajouter l’examen' }).click();
  await expect(dialog(page)).toBeHidden();
  const confirmation = page.getByRole('status').filter({ hasText: title });
  await expect(confirmation).toContainText('est ajouté');
  await expectNoAxeViolations(page);

  // The same class and hours again: the API refuses (409) and the dialog explains why; nothing is saved twice.
  await page.getByRole('button', { name: 'Ajouter un examen', exact: true }).click();
  await dialog(page).getByLabel('Classe').selectOption({ index: 1 });
  await expect(dialog(page).getByLabel('Matière').locator('option')).not.toHaveCount(1);
  await dialog(page).getByLabel('Matière').selectOption({ index: 1 });
  await dialog(page).getByLabel('Titre').fill(`${title} bis`);
  await dialog(page).getByLabel('Date').fill(friday);
  await dialog(page).getByLabel('Début').fill('18:30');
  await dialog(page).getByLabel('Fin').fill('19:30');
  await dialog(page).getByRole('button', { name: 'Ajouter l’examen' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Enregistrement impossible');
  await expect(dialog(page)).toBeVisible();
  await expectNoAxeViolations(page);

  // Clean up what the test made.
  const events = (await (await request.get(`/api/events?from=${friday}&to=${friday}`, { headers })).json()) as EventDto[];
  const made = events.filter((e) => e.title.startsWith(title));
  expect(made.map((e) => e.title)).toEqual([title]);
  for (const e of made) expect((await request.delete(`/api/events/${e.id}`, { headers })).status()).toBe(204);
});
