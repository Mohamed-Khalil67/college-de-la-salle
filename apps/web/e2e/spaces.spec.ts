import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { ACCOUNTS, type Account } from './accounts';

async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Signs in and waits until the space has opened (the access token lives in memory: no page.goto before that). */
async function signInTo(page: Page, account: Account, path: string): Promise<void> {
  await signIn(page, account);
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'));
  await page.locator('.app-bar').waitFor();
  // In-app navigation keeps the session (a full reload would restore it through the refresh cookie too).
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('the public home page presents the college', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Caire');
  await expectNoAxeViolations(page);
});

test('a wrong password is refused with a clear message', async ({ page }) => {
  await signIn(page, { email: ACCOUNTS.student.email, password: 'pas-le-bon-mot-de-passe' });
  await expect(page.getByRole('alert')).toContainText('Identifiant ou mot de passe incorrect');
  await expect(page).toHaveURL(/\/connexion/);
});

test('each role lands in its own space and cannot open another', async ({ page }) => {
  for (const [account, home, heading] of [
    [ACCOUNTS.student, '/eleve', /Bonjour/],
    [ACCOUNTS.teacher, '/enseignant', /classes/i],
    [ACCOUNTS.admin, '/admin/utilisateurs', /Utilisateurs/],
  ] as const) {
    await page.context().clearCookies();
    await signIn(page, account);
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    await page.locator('.app-bar').waitFor();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    await expectNoAxeViolations(page);
    const other = home.startsWith('/admin') ? '/eleve' : '/admin';
    await page.goto(other);
    await expect(page).toHaveURL(new RegExp(`${home}$`));
  }
});

test('a student sees their grades by subject', async ({ page }) => {
  await signInTo(page, ACCOUNTS.student, '/eleve/notes');
  await expect(page.getByRole('heading', { level: 1, name: /notes/i })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Trimestres' })).toBeVisible();
  await expect(page.locator('caption').or(page.locator('.empty-state')).first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test('a teacher takes the roll and saves it', async ({ page }) => {
  await signInTo(page, ACCOUNTS.teacher, '/enseignant/appel');
  await expect(page.getByRole('heading', { level: 1, name: /Appel/ })).toBeVisible();
  const day = page.getByLabel('Jour');
  const save = page.getByRole('button', { name: /Enregistrer l’appel/ });
  // Walk back from today until a day with a session of this class.
  for (let back = 0; back < 14 && !(await save.isVisible()); back++) {
    const date = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
    await day.fill(date);
    await page.waitForTimeout(400);
  }
  await expect(save).toBeVisible();
  await page.getByRole('button', { name: 'Marquer tout le monde présent' }).click();
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: /enregistr/i }).first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test('a teacher picks the type of a new event from the school’s activity types', async ({ page }) => {
  await signInTo(page, ACCOUNTS.teacher, '/enseignant/agenda');
  await page.getByRole('button', { name: 'Nouvel événement' }).click();
  const type = page.getByLabel('Type', { exact: true });
  // The types come from the API (system types of the school), not from a list in the code.
  await expect(type.locator('option')).toHaveText(['Cours', 'TD', 'TP', 'Examen', 'Contrôle', 'Devoir à rendre', 'Révision', 'Activité', 'Réunion']);
  // A type that is not gradable hides the coefficient; a gradable one shows it.
  await expect(page.getByLabel('Coefficient')).toBeHidden();
  await type.selectOption({ label: 'Examen' });
  await expect(page.getByLabel('Coefficient')).toBeVisible();
  await expect(page.getByLabel('Chaque semaine')).toBeHidden();
  await type.selectOption({ label: 'TD' });
  await expect(page.getByLabel('Chaque semaine', { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('a visitor writes to the secretariat; an admin reads the message and marks it handled', async ({ page }, info) => {
  const email = `parent.${info.project.name}.${Date.now()}@example.com`;
  await page.goto('/contact');
  await page.getByLabel('Nom du parent ou de l’élève').fill('Mariam Saad');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Message').fill('Bonjour, je souhaite inscrire mon fils en Seconde.');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'message a bien été envoyé' })).toContainText(email);
  await expect(page.getByLabel('Message')).toHaveValue('');
  await expectNoAxeViolations(page);

  await signInTo(page, ACCOUNTS.admin, '/admin/messages');
  await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
  const message = page.getByRole('article').filter({ hasText: email });
  await expect(message).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page);
  }
  await message.getByRole('button', { name: /Marquer comme traité/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'marqué comme traité' })).toBeVisible();
  await expect(message).toHaveCount(0);
  await page.getByRole('tab', { name: 'Traités' }).click();
  await expect(page.getByRole('article').filter({ hasText: email })).toContainText('Traité le');
  await expectNoAxeViolations(page);
});

test('an admin marks a selection handled, then deletes the message, the focus staying on the page', async ({ page }, info) => {
  // One message only: the contact form takes 5 a minute per client, and the test above sends one too.
  const subject = `Promotion ${info.project.name} ${Date.now()}`;
  const sent = await page.request.post('/api/contact', {
    data: { name: 'Robot Promo', email: `promo.${Date.now()}@example.com`, subject, message: 'Achetez maintenant.' },
  });
  expect(sent.status()).toBe(204);

  await signInTo(page, ACCOUNTS.admin, '/admin/messages');
  const message = page.getByRole('article').filter({ hasText: subject });
  await message.getByRole('checkbox', { name: /Sélectionner le message de Robot Promo/ }).check();
  const bulk = page.getByRole('button', { name: /Marquer la sélection comme traitée/ });
  await expect(bulk).toContainText('(1)');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page);
  }
  await bulk.click();
  await expect(page.getByRole('status').filter({ hasText: '1 message marqué comme traité.' })).toBeVisible();
  await expect(message).toHaveCount(0);
  // The selection left the tab: the focus is on the confirmation, not lost on the page.
  await expect(page.locator('.notice-box')).toBeFocused();

  await page.getByRole('tab', { name: 'Traités' }).click();
  await expect(message).toContainText('Traité le');
  await expect(message.getByRole('checkbox')).toHaveCount(0);

  // Deleting asks first; Cancel keeps the message.
  await message.getByRole('button', { name: /^Supprimer/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Supprimer ce message ?' });
  await expect(dialog).toContainText('Robot Promo');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toBeHidden();
  await expect(message).toBeVisible();
  await message.getByRole('button', { name: /^Supprimer/ }).click();
  await dialog.getByRole('button', { name: 'Supprimer le message' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Message de Robot Promo supprimé.' })).toBeVisible();
  await expect(message).toHaveCount(0);
  // The button that opened the dialog left with the message: the focus is on the confirmation.
  await expect(page.locator('.notice-box')).toBeFocused();
  await expectNoAxeViolations(page);

  await page.getByRole('tab', { name: 'Tous' }).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: subject })).toHaveCount(0);
});
