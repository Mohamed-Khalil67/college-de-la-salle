import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { axeAtBothWidths, goInApp, signInAs } from './structure';

/**
 * The session as a person lives it: a full reload keeps them signed in (the refresh cookie brings the access
 * token back), « Se déconnecter » in the account menu ends it, and a protected address then asks to sign in
 * and comes back to it. Widths are set inside the tests, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside each test');
});

test('a full reload while signed in keeps the session and the page', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/classes');
  await expect(page.getByRole('heading', { level: 1, name: 'Classes' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/classes');
  await expect(page.getByRole('heading', { level: 1, name: 'Classes' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Compte de/ })).toBeVisible();

  // A deep link typed in the address bar opens directly too.
  await page.goto('/admin/salles');
  await expect(page).toHaveURL((url) => url.pathname === '/admin/salles');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('« Se déconnecter » ends the session: /admin then asks to sign in and returns there', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  const account = page.getByRole('button', { name: /Compte de/ });
  await account.click();
  await expect(account).toHaveAttribute('aria-expanded', 'true');
  // Escape closes the menu and gives the focus back to its button.
  await page.keyboard.press('Escape');
  await expect(account).toHaveAttribute('aria-expanded', 'false');
  await expect(account).toBeFocused();
  await account.click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/connexion');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await axeAtBothWidths(page);

  // The refresh cookie is gone: a full load of a protected address is sent to the login page, which remembers it.
  await page.goto('/admin');
  await expect(page).toHaveURL((url) => url.pathname === '/connexion' && url.search === '?suite=%2Fadmin');
  await axeAtBothWidths(page);
  // The browser's back button does not bring the space back either.
  await page.goBack();
  await page.goto('/admin/classes');
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fadmin%2Fclasses$/);

  // Signing in from there goes back to the address asked for.
  await page.getByLabel('Identifiant').fill(ACCOUNTS.admin.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(ACCOUNTS.admin.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/classes');
  await expect(page.getByRole('heading', { level: 1, name: 'Classes' })).toBeVisible();
});
