import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { archiveStudents, studentsMatching } from './cleanup';
import { axeAtBothWidths, goInApp, signInAs, unique } from './structure';

/**
 * One account from creation to deactivation, through the screens: the admin adds a student on « Utilisateurs »
 * (the temporary password is shown once), the student signs in and must choose a password, then the admin
 * disables the account and it can no longer sign in. The account is archived afterwards (accounts are never
 * deleted), so it leaves the class lists. Widths are set inside the test, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside the test');
});

const CHOSEN = 'Papyrus-du-Nil-2026';
const lastName = unique('Cycle').replace(' ', '');

test.afterAll(async ({ request }) => {
  await archiveStudents(request, await studentsMatching(request, lastName));
});

test('the admin creates an account, its owner chooses a password, the admin disables it', async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/utilisateurs');
  await expect(page.getByRole('heading', { level: 1, name: 'Utilisateurs' })).toBeVisible();

  // The dialog: a missing name says how to fix it.
  await page.getByRole('button', { name: 'Ajouter un utilisateur' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter un utilisateur' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Type de compte').selectOption({ label: 'Élève' });
  await dialog.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(dialog.getByText('Saisissez le prénom.')).toBeVisible();
  await expect(dialog.getByText('Choisissez la classe de l’élève.')).toBeVisible();
  await axeAtBothWidths(page);

  await dialog.getByLabel('Prénom').fill('Yasmine');
  await dialog.getByLabel('Nom', { exact: true }).fill(lastName);
  await dialog.getByLabel('Classe').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Créer le compte' }).click();

  // The temporary password, once, with the generated school address.
  await expect(dialog.getByText(`Compte créé pour Yasmine ${lastName}`)).toBeVisible();
  await expect(dialog.getByText('Il ne sera plus affiché.')).toBeVisible();
  const temporary = (await dialog.locator('code.temp-password').innerText()).trim();
  expect(temporary.length).toBeGreaterThanOrEqual(10);
  const email = /\(([^)]+@[^)]+)\)/.exec(await dialog.locator('p').filter({ hasText: 'Compte créé pour' }).innerText())?.[1] ?? '';
  expect(email).toMatch(new RegExp(`^yasmine\\.${lastName.toLowerCase()}\\d*@`));
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Terminé' }).click();
  await expect(dialog).toBeHidden();
  // Reopened, the dialog is a blank form: the password is gone for good.
  await page.getByRole('button', { name: 'Ajouter un utilisateur' }).click();
  await expect(dialog.locator('code.temp-password')).toHaveCount(0);
  await expect(dialog.getByLabel('Prénom')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The list shows the new account as waiting for its first sign-in.
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill(lastName);
  const row = page.getByRole('row', { name: new RegExp(lastName) });
  await expect(row).toContainText('Premier accès à faire');

  // The owner signs in with the temporary password and must choose their own before anything else.
  const ownerContext = await browser.newContext({ locale: 'fr-FR' });
  const owner = await ownerContext.newPage();
  try {
    await owner.goto('/connexion');
    await owner.getByLabel('Identifiant').fill(email);
    await owner.getByLabel('Mot de passe', { exact: true }).fill(temporary);
    await owner.getByRole('button', { name: 'Se connecter' }).click();
    await expect(owner).toHaveURL(/\/premier-acces$/);
    await owner.goto('/eleve');
    await expect(owner).toHaveURL(/\/premier-acces$/);
    await owner.getByLabel('Mot de passe temporaire').fill(temporary);
    await owner.getByLabel('Nouveau mot de passe', { exact: true }).fill(CHOSEN);
    await owner.getByLabel('Confirmer le nouveau mot de passe').fill(CHOSEN);
    await owner.getByRole('button', { name: 'Choisir ce mot de passe' }).click();
    await owner.getByRole('button', { name: /c’est correct/ }).click();
    await expect(owner).toHaveURL(/\/eleve$/);
    await expect(owner.getByRole('heading', { level: 1 })).toContainText('Bonjour');

    // The admin's list now says the account is in use.
    await page.reload();
    await page.getByRole('searchbox', { name: 'Rechercher' }).fill(lastName);
    await expect(row).not.toContainText('Premier accès à faire');

    // The admin disables it, behind a confirmation.
    await row.getByRole('button', { name: `Désactiver le compte de Yasmine ${lastName}` }).click();
    const confirm = page.getByRole('dialog', { name: 'Désactiver ce compte ?' });
    await expect(confirm).toContainText(`Yasmine ${lastName}`);
    await axeAtBothWidths(page);
    await confirm.getByRole('button', { name: 'Désactiver le compte' }).click();
    await expect(confirm).toBeHidden();
    await expect(row).toContainText('Désactivé');
    await expect(row.getByRole('button', { name: /^Désactiver/ })).toHaveCount(0);

    // The owner is signed out everywhere and can no longer sign in, with either password.
    await owner.reload();
    await expect(owner).toHaveURL(/\/connexion/);
    await owner.getByLabel('Identifiant').fill(email);
    await owner.getByLabel('Mot de passe', { exact: true }).fill(CHOSEN);
    await owner.getByRole('button', { name: 'Se connecter' }).click();
    await expect(owner.getByRole('alert')).toBeVisible();
    await expect(owner).toHaveURL(/\/connexion/);
    for (const password of [CHOSEN, temporary])
      expect((await request.post('/api/auth/login', { data: { email, password } })).status()).toBe(401);
  } finally {
    await ownerContext.close();
  }
});
