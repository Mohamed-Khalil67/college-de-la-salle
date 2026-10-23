import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNTS } from './accounts';
import { axeAtBothWidths, tokenOf } from './structure';

/**
 * « Mot de passe oublié »: request a link, read it from the dev mail the API's `log` transport wrote
 * (apps/api/.dev-mail), choose a new password, sign in with it. Run against a stack whose API uses
 * MAIL_TRANSPORT=log and starts in apps/api (the default `npm run dev`).
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at both widths inside the test');
});

const MAIL_DIR = resolve(__dirname, '../../api/.dev-mail');
const NEW_PASSWORD = 'Cedre-du-Liban-2026';

/** The reset link of the newest mail written for this address. */
function linkFor(email: string): string | undefined {
  const files = readdirSync(MAIL_DIR)
    .filter((f) => f.endsWith(`_${email}.txt`))
    .sort();
  const last = files.at(-1);
  return last ? /https?:\/\/\S+\/connexion\/reinitialiser\?token=\S+/.exec(readFileSync(resolve(MAIL_DIR, last), 'utf8'))?.[0] : undefined;
}

test('forgot password: request, e-mailed link, new password, sign in', async ({ page, request }) => {
  test.setTimeout(90_000);
  const headers = await tokenOf(request, ACCOUNTS.admin);
  const created = await request.post('/api/users', {
    headers,
    data: { role: 'teacher', firstName: 'Oubli', lastName: `Mdp${Date.now().toString(36)}` },
  });
  expect(created.ok()).toBeTruthy();
  const { user } = (await created.json()) as { user: { email: string } };

  // The login page offers the way in.
  await page.goto('/connexion');
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page).toHaveURL(/\/connexion\/oubli$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mot de passe oublié' })).toBeVisible();
  await axeAtBothWidths(page);

  // An empty form says what is missing.
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByText('Saisissez votre adresse e-mail.')).toBeVisible();

  await page.getByLabel('Identifiant').fill(user.email);
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifiez votre messagerie' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(user.email);
  await axeAtBothWidths(page);

  // The mail with the link reaches the dev mail folder.
  await expect.poll(() => linkFor(user.email), { timeout: 15_000 }).toBeTruthy();
  const link = linkFor(user.email)!;
  const target = new URL(link);

  await page.goto(`${target.pathname}${target.search}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Choisir un nouveau mot de passe' })).toBeVisible();
  await axeAtBothWidths(page);

  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('court');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('court');
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.getByText('Le mot de passe doit compter au moins 10 caractères.')).toBeVisible();

  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirmer le nouveau mot de passe').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mot de passe modifié' })).toBeVisible();
  await axeAtBothWidths(page);

  // The link works once: a second visit is refused with a way to ask again.
  await page.goto(`${target.pathname}${target.search}`);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirmer le nouveau mot de passe').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.getByText('Ce lien est invalide ou a expiré.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible();
  await axeAtBothWidths(page);

  // The new password opens the teacher's space directly (no first-access step).
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/enseignant/);
});

test('the reset page without a token offers a new link; any identifier gets the same answer', async ({ page }) => {
  await page.goto('/connexion/reinitialiser');
  await expect(page.getByRole('heading', { level: 1, name: 'Lien incomplet' })).toBeVisible();
  await axeAtBothWidths(page);

  await page.goto('/connexion/oubli');
  await page.getByLabel('Identifiant').fill('personne.inconnue@demo.cdls.test');
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifiez votre messagerie' })).toBeVisible();
});
