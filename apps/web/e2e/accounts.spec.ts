import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import { ACCOUNTS, type Account } from './accounts';

/**
 * Phase 4: first sign-in, student section request, admin approval, roster import, archiving.
 * Accounts are created through the API (as the admin does), then the flows run in the browser.
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

const NEW_PASSWORD = 'Cedre-du-Liban-2026';

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Axe at 390 and 1440 px, then back to the project's own viewport. */
async function axeAtBothWidths(page: Page): Promise<void> {
  const original = page.viewportSize();
  for (const size of VIEWPORTS) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    await expectNoAxeViolations(page);
  }
  if (original) await page.setViewportSize(original);
}

/** A name that makes a unique e-mail on every run (letters only: the generator keeps letters and digits). */
function uniqueName(prefix: string): string {
  const letters = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  return `${prefix}${letters}`;
}

interface Created {
  readonly email: string;
  readonly temporaryPassword: string;
  readonly firstName: string;
  readonly lastName: string;
}

async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/login', { data: ACCOUNTS.admin });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function createStudent(request: APIRequestContext, section: string, classCode: string): Promise<Created> {
  const token = await adminToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const classes = (await (await request.get('/api/classes', { headers })).json()) as {
    id: string;
    code: string;
    sectionCode: string;
  }[];
  const target = classes.find((c) => c.sectionCode === section && c.code === classCode)!;
  const firstName = uniqueName('Prenom');
  const lastName = uniqueName('Nom');
  const res = await request.post('/api/users', {
    headers,
    data: { role: 'student', firstName, lastName, classId: target.id },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { user: { email: string }; temporaryPassword: string };
  return { email: body.user.email, temporaryPassword: body.temporaryPassword, firstName, lastName };
}

async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Opens a space page through the router (the access token lives in memory: a full load would refresh it). */
async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}

async function choosePassword(page: Page, temporary: string): Promise<void> {
  await page.getByLabel('Mot de passe temporaire').fill(temporary);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirmer le nouveau mot de passe').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Choisir ce mot de passe' }).click();
}

test('first sign-in: choose a password, confirm section and class, reach the space', async ({ page, request }) => {
  const student = await createStudent(request, 'nationale', 'secondaire-1');
  await signIn(page, { email: student.email, password: student.temporaryPassword });
  await expect(page).toHaveURL(/\/premier-acces$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bienvenue');
  await axeAtBothWidths(page);

  // The rules are explained next to the field, and nothing is saved while they are broken.
  await page.getByLabel('Mot de passe temporaire').fill(student.temporaryPassword);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('court');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('autre');
  await page.getByRole('button', { name: 'Choisir ce mot de passe' }).click();
  await expect(page.getByText('au moins 10 caractères').first()).toBeVisible();
  await expect(page.getByText('ne sont pas identiques')).toBeVisible();
  await expect(page).toHaveURL(/\/premier-acces$/);

  // Another page is out of reach until a password is chosen.
  await page.goto('/eleve');
  await expect(page).toHaveURL(/\/premier-acces$/);

  await choosePassword(page, student.temporaryPassword);
  await expect(page.getByRole('heading', { level: 1, name: 'Votre section et votre classe' })).toBeFocused();
  await expect(page.getByText('Bac nationale')).toBeVisible();
  await expect(page.getByText('1re secondaire')).toBeVisible();
  await axeAtBothWidths(page);
  await page.getByRole('button', { name: /c’est correct/ }).click();
  await expect(page).toHaveURL(/\/eleve$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Bonjour/);

  // The new password works, the temporary one no longer does.
  const again = await request.post('/api/auth/login', { data: { email: student.email, password: NEW_PASSWORD } });
  expect(again.status()).toBe(200);
  const old = await request.post('/api/auth/login', { data: { email: student.email, password: student.temporaryPassword } });
  expect(old.status()).toBe(401);
});

test('the account menu changes the password', async ({ page, request }) => {
  const student = await createStudent(request, 'bac', 'seconde');
  await signIn(page, { email: student.email, password: student.temporaryPassword });
  await page.waitForURL(/\/premier-acces$/);
  await choosePassword(page, student.temporaryPassword);
  await page.getByRole('button', { name: /c’est correct/ }).click();
  await page.locator('.app-bar').waitFor();

  await page.getByRole('button', { name: /Compte de/ }).click();
  await page.getByRole('button', { name: 'Changer mon mot de passe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Changer mon mot de passe' });
  await expect(dialog).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByLabel('Mot de passe actuel').fill(NEW_PASSWORD);
  await dialog.getByLabel('Nouveau mot de passe', { exact: true }).fill('Une-autre-phrase-2027');
  await dialog.getByLabel('Confirmer le nouveau mot de passe').fill('Une-autre-phrase-2027');
  await dialog.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(dialog.getByText('Votre mot de passe est modifié')).toBeVisible();
  await dialog.getByRole('button', { name: 'Terminé' }).click();
  await expect(dialog).toBeHidden();
});

test('a student asks for a section change and the admin approves it', async ({ page, request, browser }) => {
  const student = await createStudent(request, 'nationale', 'secondaire-1');
  // Skip the first-access page: the API call does what the page does.
  const login = await request.post('/api/auth/login', { data: { email: student.email, password: student.temporaryPassword } });
  const session = (await login.json()) as { accessToken: string };
  const changed = await request.post('/api/auth/password', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    data: { currentPassword: student.temporaryPassword, newPassword: NEW_PASSWORD },
  });
  expect(changed.status()).toBe(200);

  // The student's side.
  await signIn(page, { email: student.email, password: NEW_PASSWORD });
  await page.locator('.app-bar').waitFor();
  await page.getByRole('button', { name: /Compte de/ }).click();
  await page.getByRole('link', { name: 'Ma section' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ma section' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /Demander le passage en Bac français/ })).toBeVisible();
  await axeAtBothWidths(page);

  await page.getByRole('button', { name: /Envoyer la demande/ }).click();
  await expect(page.getByText('Expliquez en quelques mots')).toBeVisible();
  await page.getByLabel('Pourquoi souhaitez-vous changer de section ?').fill('Je prépare des études en France.');
  await page.getByRole('button', { name: /Envoyer la demande/ }).click();
  await expect(page.getByText('Votre demande est envoyée')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Demande en cours' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Envoyer la demande/ })).toHaveCount(0);
  await axeAtBothWidths(page);

  // The admin's side, in a fresh browser context.
  const adminContext = await browser.newContext({ locale: 'fr-FR' });
  const adminPage = await adminContext.newPage();
  try {
    await signIn(adminPage, ACCOUNTS.admin);
    await adminPage.locator('.app-bar').waitFor();
    await goInApp(adminPage, '/admin/validations');
    await expect(adminPage.getByRole('heading', { level: 1, name: 'Validations' })).toBeVisible();
    const name = `${student.firstName} ${student.lastName}`;
    const row = adminPage.getByRole('row', { name: new RegExp(name) });
    await expect(row).toContainText('Bac nationale → Bac français');
    await axeAtBothWidths(adminPage);

    await row.getByRole('button', { name: /Approuver/ }).click();
    const dialog = adminPage.getByRole('dialog', { name: 'Approuver le changement de section' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Approuver et déplacer/ }).click();
    await expect(dialog.getByText('Choisissez la classe d’arrivée')).toBeVisible();
    await axeAtBothWidths(adminPage);
    await dialog.getByLabel('Classe d’arrivée').selectOption({ label: 'Seconde' });
    await dialog.getByLabel('Message à l’élève (facultatif)').fill('Bienvenue en Bac français.');
    await dialog.getByRole('button', { name: /Approuver et déplacer/ }).click();
    await expect(adminPage.getByText(`${name} est maintenant en Seconde.`)).toBeVisible();
    await adminPage.getByRole('tab', { name: /Approuvées/ }).click();
    await expect(adminPage.getByRole('row', { name: new RegExp(name) })).toContainText('Approuvée');
  } finally {
    await adminContext.close();
  }

  // Back on the student's side: the move is visible after a reload.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Ma section' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Vous êtes en Seconde/ })).toBeVisible();
  await expect(page.getByText('Bac français').first()).toBeVisible();
});

test('the admin rejects a request with a reason', async ({ page, request }) => {
  const student = await createStudent(request, 'bac', 'seconde');
  const token = await adminToken(request);
  const classes = await (await request.get('/api/classes', { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(classes.length).toBeGreaterThan(0);
  const users = await (await request.get(`/api/users?search=${student.email}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const studentId = (users as { items: { studentId: string }[] }).items[0]!.studentId;
  const made = await request.post('/api/section-changes', {
    headers: { Authorization: `Bearer ${token}` },
    data: { studentId, toSection: 'nationale', reason: 'Saisie du secrétariat' },
  });
  expect(made.status()).toBe(201);

  await signIn(page, ACCOUNTS.admin);
  await page.locator('.app-bar').waitFor();
  await goInApp(page, '/admin/validations');
  const row = page.getByRole('row', { name: new RegExp(`${student.firstName} ${student.lastName}`) });
  await expect(row).toContainText('Saisie par');
  await row.getByRole('button', { name: /Refuser/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Refuser le changement de section' });
  await dialog.getByRole('button', { name: 'Refuser la demande' }).click();
  await expect(dialog.getByText('Indiquez la raison du refus')).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByLabel('Raison du refus').fill('Pas de changement en cours d’année.');
  await dialog.getByRole('button', { name: 'Refuser la demande' }).click();
  await expect(page.getByText(/est refusée/)).toBeVisible();
});

test('the secretariat opens a request for a student', async ({ page, request }) => {
  const student = await createStudent(request, 'nationale', 'secondaire-2');
  await signIn(page, ACCOUNTS.admin);
  await page.locator('.app-bar').waitFor();
  await goInApp(page, '/admin/validations');
  await page.getByRole('button', { name: 'Nouvelle demande' }).click();
  const dialog = page.getByRole('dialog', { name: /Nouvelle demande/ });
  await expect(dialog).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByLabel('Rechercher l’élève').fill(student.lastName);
  await expect(dialog.getByText(/1 élève trouvé/)).toBeVisible();
  await dialog.getByLabel('Élève', { exact: true }).selectOption({ index: 1 });
  await expect(dialog.getByText('Bac français', { exact: true })).toBeVisible();
  await dialog.getByLabel('Raison').fill('Demande des parents, reçue au secrétariat.');
  await dialog.getByRole('button', { name: 'Ouvrir la demande' }).click();
  await expect(page.getByText('La demande est ouverte')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(student.lastName) })).toContainText('Saisie par');
});

test('roster import: preview the generated e-mails, then create the accounts', async ({ page }) => {
  const last = uniqueName('Import');
  const csv = [
    'lastName,firstName,section,class,studentNumber,birthDate',
    `${last},Zoé,bac,seconde,,15/03/2010`,
    `${last} Bis,Élodie,nationale,secondaire-1,,`,
  ].join('\n');
  const bad = ['lastName,firstName,section,class', `${last},Zoé,bac,inconnue`].join('\n');

  await signIn(page, ACCOUNTS.admin);
  await page.locator('.app-bar').waitFor();
  await page.getByRole('button', { name: 'Importer un CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer une liste' });
  await expect(dialog).toBeVisible();
  await axeAtBothWidths(page);

  // An invalid line: the preview says so and offers no import.
  await dialog.getByLabel('Fichier CSV').setInputFiles({ name: 'eleves.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) });
  await dialog.getByRole('button', { name: 'Vérifier le fichier' }).click();
  await expect(dialog.getByText('Import impossible')).toBeVisible();
  await expect(dialog.getByText('classe inconnue')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Créer/ })).toHaveCount(0);
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Changer de fichier' }).click();

  await dialog.getByLabel('Fichier CSV').setInputFiles({ name: 'eleves.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await dialog.getByRole('button', { name: 'Vérifier le fichier' }).click();
  await expect(dialog.getByText('2 comptes seront créés')).toBeVisible();
  const slug = last.toLowerCase();
  await expect(dialog.getByRole('cell', { name: `zoe.${slug}@demo.cdls.test` })).toBeVisible();
  await expect(dialog.getByRole('cell', { name: `elodie.${slug}-bis@demo.cdls.test` })).toBeVisible();
  await axeAtBothWidths(page);

  await dialog.getByRole('button', { name: 'Créer 2 comptes' }).click();
  await expect(dialog.getByText('2 comptes créés')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Télécharger la liste/ })).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Terminé' }).click();
});

test('graduating a student: confirmation first, then the account cannot sign in', async ({ page, request }) => {
  const student = await createStudent(request, 'bac', 'terminale');
  await signIn(page, ACCOUNTS.admin);
  await page.locator('.app-bar').waitFor();
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill(student.lastName);
  const row = page.getByRole('row', { name: new RegExp(student.lastName) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Premier accès à faire');
  await row.getByRole('button', { name: /Diplômé ou parti/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Diplômé ou parti' });
  await expect(dialog).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Continuer' }).click();
  await expect(dialog.getByText('Confirmez l’archivage')).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Archiver le compte' }).click();
  await expect(page.getByText('1 compte archivé')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(student.lastName) })).toContainText('Archivé');

  const refused = await request.post('/api/auth/login', { data: { email: student.email, password: student.temporaryPassword } });
  expect(refused.status()).toBe(401);
});

test('archiving a class asks for confirmation', async ({ page, request }) => {
  // A class of its own so the seeded classes stay intact.
  const token = await adminToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const classes = (await (await request.get('/api/classes', { headers })).json()) as {
    id: string;
    code: string;
    sectionCode: string;
    schoolYearId: string;
    sectionId: string;
  }[];
  const model = classes.find((c) => c.sectionCode === 'bac' && c.code === 'seconde')!;
  const code = `arch-${Date.now().toString(36)}`;
  const made = await request.post('/api/classes', {
    headers,
    data: { schoolYearId: model.schoolYearId, sectionId: model.sectionId, code, label: `Classe ${code}` },
  });
  expect(made.status()).toBe(201);
  const created = (await made.json()) as { id: string };
  const user = await request.post('/api/users', {
    headers,
    data: { role: 'student', firstName: uniqueName('Arch'), lastName: uniqueName('Eleve'), classId: created.id },
  });
  expect(user.status()).toBe(201);

  await signIn(page, ACCOUNTS.admin);
  await page.locator('.app-bar').waitFor();
  await goInApp(page, `/admin/classes/${created.id}`);
  await page.getByRole('button', { name: 'Archiver la classe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Archiver une classe' });
  await expect(dialog).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByRole('radio', { name: 'A quitté le collège' }).check();
  await dialog.getByRole('button', { name: 'Continuer' }).click();
  await expect(dialog.getByText('Confirmez l’archivage')).toBeVisible();
  await dialog.getByRole('button', { name: 'Archiver 1 élève' }).click();
  await expect(page.getByText('1 élève archivé')).toBeVisible();
});

test('the users page and the edit dialog are accessible with the new statuses', async ({ page, request }) => {
  const student = await createStudent(request, 'bac', 'seconde');
  await signIn(page, ACCOUNTS.admin);
  await page.locator('.app-bar').waitFor();
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill(student.lastName);
  await expect(page.getByRole('row', { name: new RegExp(student.lastName) })).toBeVisible();
  await axeAtBothWidths(page);
  await page.getByRole('button', { name: 'Ajouter un utilisateur' }).click();
  const create = page.getByRole('dialog', { name: 'Ajouter un utilisateur' });
  await expect(create.getByLabel('Adresse e-mail (facultative)')).toBeVisible();
  await axeAtBothWidths(page);
});
