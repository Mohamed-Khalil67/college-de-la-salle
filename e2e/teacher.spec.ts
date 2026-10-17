import { expect, test } from '@playwright/test';
import { PASSWORD, allowTeacher, clearFirestore, registerTeacher, uniqueEmail, verifyEmail } from './support';

/*
 * The teacher space: who gets in (listed AND verified), publishing, validation, deletion, and safe
 * rendering of what teachers type. Against the Firebase emulators (`npm run test:e2e` starts them).
 */

test.beforeEach(clearFirestore);

async function createAccount(page: import('@playwright/test').Page, name: string, email: string): Promise<void> {
  await page.goto('/espace-enseignant');
  await page.getByTestId('tab-register').click();
  await page.getByLabel('Nom et prénom').fill(name);
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
}

test('signed out: the teacher space asks to sign in', async ({ page }) => {
  await page.goto('/espace-enseignant');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espace enseignant');
  await expect(page.getByRole('tab', { name: 'Connexion' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('teacher-dashboard')).toHaveCount(0);
});

test('an e-mail the school has not listed gets no access, even when verified', async ({ page }) => {
  const email = uniqueEmail('intrus');
  await createAccount(page, 'Intrus', email);
  await expect(page.getByTestId('not-authorised')).toBeVisible();
  await verifyEmail(email);
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByTestId('not-authorised')).toBeVisible();
  await expect(page.getByTestId('teacher-dashboard')).toHaveCount(0);
  await expect(page.getByTestId('teacher-link')).toHaveText('Espace enseignant');
});

test('a listed teacher must verify their e-mail before publishing', async ({ page }) => {
  const email = uniqueEmail('marc');
  await allowTeacher(email);
  await createAccount(page, 'Marc Dupont', email);
  await expect(page.getByTestId('unverified')).toBeVisible();
  await expect(page.getByTestId('teacher-dashboard')).toHaveCount(0);

  // Still unverified: refreshing changes nothing.
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('unverified')).toBeVisible();

  await verifyEmail(email);
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('hello')).toHaveText('Bonjour Marc');
  await expect(page.getByTestId('teacher-link')).toHaveText('Mon espace enseignant');
});

test('a teacher signs back in and finds their publications; validation explains what is missing', async ({ page }) => {
  const email = uniqueEmail('lea');
  await registerTeacher(page, { name: 'Léa Martin', email });

  // Validation, in French.
  await page.getByTestId('publish').click();
  await expect(page.getByText('Saisissez un titre.')).toBeVisible();
  await page.getByTestId('type-assignment').click();
  await page.getByLabel('Titre').fill('Exercices');
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('form-message')).toHaveText('Choisissez la date à laquelle le devoir est à rendre.');
  await page.getByTestId('type-resource').click();
  await page.getByLabel('Lien (https)').fill('http://example.org');
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('form-message')).toHaveText('Le lien doit commencer par https://.');

  // Publish, sign out, sign in again: the publication is still there; delete it.
  await page.getByTestId('type-announcement').click();
  await page.getByLabel('Titre').fill('Réunion parents-professeurs');
  await page.getByLabel('Message').fill('Jeudi à 17 h.');
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('form-message')).toContainText('Publié');
  await page.getByTestId('logout').click();
  await expect(page.getByRole('tab', { name: 'Connexion' })).toBeVisible();

  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByTestId('teacher-dashboard')).toBeVisible();
  await page.getByTestId('tab-mine').click();
  const mine = page.getByTestId('my-posts').getByTestId('post');
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText('Réunion parents-professeurs');
  await mine.getByTestId('delete-post').click();
  await expect(page.getByTestId('empty')).toContainText('Vous n’avez encore rien publié');
});

test('what teachers type is shown as text, and Arabic text reads right-to-left on its own', async ({ page }) => {
  await registerTeacher(page, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await page.getByLabel('Titre').fill('<img src=x onerror="window.__pwned=1"> درس اللغة العربية');
  await page.getByLabel('Message').fill('<script>window.__pwned=1</script>');
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('form-message')).toContainText('Publié');

  await page.getByTestId('tab-mine').click();
  const title = page.getByTestId('post-title');
  await expect(title).toContainText('<img src=x onerror="window.__pwned=1">');
  await expect(title).toHaveAttribute('dir', 'auto');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(page.getByTestId('my-posts').locator('img[src="x"]')).toHaveCount(0);
});
