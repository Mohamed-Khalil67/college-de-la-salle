import { expect, type Page, test } from '@playwright/test';

/*
 * Student accounts, against the Firebase emulators (`npm run test:e2e` starts them):
 * sign-up → dashboard → progress and favourites → sign out → sign back in → still there.
 */

const PASSWORD = 'motdepasse123';

function uniqueEmail(tag: string): string {
  return `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.org`;
}

async function register(page: Page, opts: { name: string; email: string; section: 'nationale' | 'bac'; classe: string }): Promise<void> {
  await page.goto('/espace-eleve');
  await page.getByTestId('tab-register').click();
  await page.getByLabel('Nom et prénom').fill(opts.name);
  await page.getByTestId(`section-${opts.section}`).click();
  await page.getByLabel('Ma classe').selectOption({ label: opts.classe });
  await page.getByLabel('Adresse e-mail').fill(opts.email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
}

test('signed out: the student space asks to sign in, and subject pages offer the link', async ({ page }) => {
  await page.goto('/espace-eleve');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espace élève');
  await expect(page.getByRole('tab', { name: 'Connexion' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('account-link')).toHaveText('Espace élève');

  await page.goto('/matiere/mathematiques');
  // (The hint lives in the table-of-contents column, which is desktop-only.)
  await expect(page.getByTestId('login-prompt')).toHaveCount(1);
  await expect(page.locator('[data-testid^="revise-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="fav-"]')).toHaveCount(0);
});

test('forms validate in French and sign-in errors are explained', async ({ page }) => {
  await page.goto('/espace-eleve');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Saisissez votre adresse e-mail.')).toBeVisible();

  await page.getByLabel('Adresse e-mail').fill('inconnu@example.org');
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByTestId('form-message')).toHaveText('E-mail ou mot de passe incorrect.');

  await page.getByTestId('tab-register').click();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByText('Saisissez votre nom et prénom.')).toBeVisible();
  await page.getByLabel('Nom et prénom').fill('Test');
  await page.getByLabel('Adresse e-mail').fill('pas-un-email');
  await page.getByLabel('Mot de passe').fill('court');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible();
  await expect(page.getByText('Le mot de passe doit contenir au moins 8 caractères.')).toBeVisible();
});

test('create an account, track progress and favourites, and find them again after signing back in', async ({ page, browser }) => {
  const email = uniqueEmail('sara');
  await register(page, { name: 'Sara Ibrahim', email, section: 'bac', classe: 'Première' });

  // Dashboard reflects the choices.
  await expect(page.getByTestId('hello')).toHaveText('Bonjour Sara');
  await expect(page.getByTestId('chip-section')).toHaveText('Section Bac français');
  await expect(page.getByTestId('chip-class')).toHaveText('Première');
  await expect(page.getByTestId('account-link')).toHaveText('Mon espace · Sara');
  await expect(page.getByTestId('progress-mathematiques')).toHaveText('0 %');
  await expect(page.getByText('Aucun favori pour l’instant.')).toBeVisible();

  // Subject page: tick chapters, save an example and a formula.
  await page.goto('/matiere/mathematiques');
  await expect(page.getByTestId('login-prompt')).toHaveCount(0);
  await page.getByTestId('revise-derivation').getByRole('checkbox').check();
  await page.getByTestId('revise-integration').getByRole('checkbox').check();
  await expect(page.getByTestId('my-progress')).toContainText('2 chapitres révisés sur 6');
  await page.getByTestId('fav-ex-1').click();
  await expect(page.getByTestId('fav-ex-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('fav-ex-1')).toContainText('Enregistré');
  await page.getByTestId('fav-fo-0').click();
  await expect(page.getByTestId('fav-fo-0')).toHaveAttribute('aria-pressed', 'true');

  // Dashboard: progress bar and favourites (kept across a full reload: it is stored, not in memory).
  await page.goto('/espace-eleve');
  await expect(page.getByTestId('progress-mathematiques')).toHaveText('33 %');
  const favourites = page.getByTestId('favourites').locator('li');
  await expect(favourites).toHaveCount(2);
  await expect(favourites.filter({ hasText: 'Intégrer par parties' })).toContainText('Exercice corrigé');
  await expect(favourites.filter({ hasText: 'Dérivée d’un produit' })).toContainText('Formule');

  // Remove a favourite from the dashboard.
  await favourites.filter({ hasText: 'Dérivée d’un produit' }).getByRole('button', { name: /Retirer/ }).click();
  await expect(favourites).toHaveCount(1);

  // Sign out: the space is closed and the subject page no longer shows the controls.
  await page.getByTestId('logout').click();
  await expect(page.getByRole('tab', { name: 'Connexion' })).toBeVisible();
  await expect(page.getByTestId('account-link')).toHaveText('Espace élève');
  await page.goto('/matiere/mathematiques');
  await expect(page.locator('[data-testid^="revise-"]')).toHaveCount(0);

  // A different browser sees nothing of it, and signing in there restores everything.
  const other = await browser.newContext({ locale: 'fr' });
  const second = await other.newPage();
  await second.goto('/espace-eleve');
  await second.getByLabel('Adresse e-mail').fill(email);
  await second.getByLabel('Mot de passe').fill(PASSWORD);
  await second.getByRole('button', { name: 'Se connecter' }).click();
  await expect(second.getByTestId('hello')).toHaveText('Bonjour Sara');
  await expect(second.getByTestId('progress-mathematiques')).toHaveText('33 %');
  await expect(second.getByTestId('favourites').locator('li')).toHaveCount(1);
  await other.close();
});

test('two students never see each other’s data', async ({ browser }) => {
  const a = await (await browser.newContext({ locale: 'fr' })).newPage();
  const b = await (await browser.newContext({ locale: 'fr' })).newPage();
  await register(a, { name: 'Alice Martin', email: uniqueEmail('alice'), section: 'nationale', classe: '3e secondaire (Thanaweya Amma)' });
  await register(b, { name: 'Bilal Haddad', email: uniqueEmail('bilal'), section: 'nationale', classe: '2e secondaire' });

  await a.goto('/matiere/physique-chimie');
  await a.getByTestId('revise-courant').getByRole('checkbox').check();
  await expect(a.getByTestId('my-progress')).toContainText('1 chapitre révisé sur 10');

  await b.goto('/matiere/physique-chimie');
  await expect(b.getByTestId('my-progress')).toContainText('0 chapitre révisé sur 10');
  await expect(b.getByTestId('revise-courant').getByRole('checkbox')).not.toBeChecked();
  await a.context().close();
  await b.context().close();
});

test('Arabic subject page: the student controls are in Arabic and work', async ({ page }) => {
  await register(page, { name: 'Nour Hassan', email: uniqueEmail('nour'), section: 'nationale', classe: '3e secondaire (Thanaweya Amma)' });
  await page.goto('/matiere/arabe');
  const tick = page.getByTestId('revise-nahw');
  await expect(tick).toContainText('راجعتُ هذه الوحدة');
  await tick.getByRole('checkbox').check();
  await expect(page.getByTestId('my-progress')).toContainText('راجعتَ ١ من ٦ وحدات');
  await expect(page.getByTestId('fav-ex-0')).toContainText('حفظ');
  // The header still reads left-to-right while the article is RTL.
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByTestId('subject')).toHaveAttribute('dir', 'rtl');
});
