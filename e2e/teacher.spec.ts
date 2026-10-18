import { expect, test } from '@playwright/test';
import { PASSWORD, addEvent, allowTeacher, announce, clearFirestore, isoDay, registerTeacher, uniqueEmail, verifyEmail } from './support';

/*
 * The teacher space: who gets in (listed AND verified), the editable calendar, announcements, and safe
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

test('the event form explains what is missing', async ({ page }) => {
  await registerTeacher(page, { name: 'Léa Martin', email: uniqueEmail('lea') });
  await page.getByTestId('new-event').click();
  const form = page.getByTestId('event-form');
  await form.getByTestId('ef-save').click();
  await expect(form.getByText('Saisissez un titre.')).toBeVisible();

  await form.getByLabel('Titre').fill('TP de chimie');
  await form.getByTestId('kind-tp').click();
  await form.getByTestId('ef-start').fill('10:00');
  await form.getByTestId('ef-end').fill('09:00');
  await form.getByTestId('ef-save').click();
  await expect(form.getByTestId('ef-message')).toHaveText('L’heure de fin doit être après l’heure de début.');

  await form.getByTestId('ef-end').fill('12:00');
  await form.getByTestId('ef-weekly').check();
  await form.getByTestId('ef-save').click();
  await expect(form.getByTestId('ef-message')).toContainText('Choisissez jusqu’à quand l’événement se répète');

  await form.getByTestId('ef-weekly').uncheck();
  await form.getByTestId('ef-att-add').click();
  await form.getByTestId('ef-att-url').fill('http://example.org/cours.pdf');
  await form.getByTestId('ef-save').click();
  await expect(form.getByTestId('ef-message')).toContainText('doit commencer par https://');

  await form.getByTestId('ef-att-url').fill('https://example.org/cours.pdf');
  await form.getByTestId('ef-save').click();
  await expect(form).toBeHidden();
  await expect(page.getByTestId('agenda').getByTestId('cal-event-title').filter({ hasText: 'TP de chimie' })).toBeVisible();
});

test('a teacher edits and deletes events, signs back in and finds announcements', async ({ page }) => {
  const email = uniqueEmail('marc');
  await registerTeacher(page, { name: 'Marc Dupont', email });
  await addEvent(page, { kind: 'reunion', title: 'Réunion parents-professeurs', start: '17:00', place: 'Salle des fêtes' });

  // Edit: open the event, change the place.
  const agenda = page.getByTestId('agenda');
  const meeting = agenda.getByTestId('cal-event').filter({ hasText: 'Réunion parents-professeurs' });
  await meeting.click();
  const dialog = page.getByTestId('event-dialog');
  await dialog.getByTestId('ev-edit').click();
  const form = page.getByTestId('event-form');
  await form.getByTestId('ef-place').fill('Chapelle');
  await form.getByTestId('ef-save').click();
  await expect(form).toBeHidden();
  await expect(meeting).toContainText('Chapelle');

  // Deleting asks for a confirmation.
  await meeting.click();
  await dialog.getByTestId('ev-delete').click();
  await dialog.getByTestId('ev-delete-confirm').click();
  await expect(meeting).toHaveCount(0);

  // Announcements: validation, publish, sign out and back in, delete.
  const card = page.getByTestId('announcements');
  await card.getByTestId('publish').click();
  await expect(card.getByText('Saisissez un titre.')).toBeVisible();
  await announce(page, { title: 'Journée portes ouvertes', body: 'Samedi de 9 h à 13 h.' });
  await page.getByTestId('logout').click();
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByTestId('teacher-dashboard')).toBeVisible();
  const mine = page.getByTestId('my-posts').getByTestId('post');
  await expect(mine).toHaveCount(1);
  await mine.getByTestId('delete-post').click();
  await expect(page.getByTestId('my-posts')).toHaveCount(0);
});

test('the class filter shows a class with its section’s events; weekly classes repeat on the next weeks', async ({ page }) => {
  await registerTeacher(page, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await addEvent(page, { kind: 'cours', title: 'Physique Première', target: 'Bac français — Première', start: '10:00', end: '11:00', weeklyUntil: isoDay(30) });
  await addEvent(page, { kind: 'td', title: 'TD Terminale', target: 'Bac français — Terminale', start: '13:00', end: '14:00' });
  await addEvent(page, { kind: 'activite', title: 'Club théâtre', target: 'Tout le Bac français', start: '15:00' });

  const agenda = page.getByTestId('agenda');
  const titles = agenda.getByTestId('cal-event-title');
  await expect(titles).toHaveText(['Physique Première', 'TD Terminale', 'Club théâtre']);
  await agenda.getByTestId('cal-filter').selectOption({ label: 'Bac français — Première' });
  await expect(titles).toHaveText(['Physique Première', 'Club théâtre']);

  await agenda.getByTestId('cal-next').click();
  await expect(titles).toHaveText(['Physique Première']);
  await agenda.getByTestId('cal-today').click();

  // Hovering previews an event (desktop only: on phones a tap opens it).
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await titles.first().hover();
    await expect(agenda.locator('.preview').first()).toBeVisible();
  }
});

test('« Ajouter à mon agenda » downloads an .ics file with the weekly repetition', async ({ page }) => {
  await registerTeacher(page, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await addEvent(page, { kind: 'cours', title: 'Anglais', start: '09:00', end: '10:00', place: 'Salle 7', weeklyUntil: isoDay(21) });
  await page.getByTestId('agenda').getByTestId('cal-event').filter({ hasText: 'Anglais' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('ev-ics').click()]);
  expect(download.suggestedFilename()).toBe('Anglais.ics');
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text).toContain('SUMMARY:Cours — Anglais');
  expect(text).toContain('LOCATION:Salle 7');
  expect(text).toContain('RRULE:FREQ=WEEKLY');
});

test('what teachers type is shown as text, and Arabic text reads right-to-left on its own', async ({ page }) => {
  await registerTeacher(page, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await announce(page, { title: '<img src=x onerror="window.__pwned=1"> درس اللغة العربية', body: '<script>window.__pwned=1</script>' });
  const title = page.getByTestId('my-posts').getByTestId('post-title');
  await expect(title).toContainText('<img src=x onerror="window.__pwned=1">');
  await expect(title).toHaveAttribute('dir', 'auto');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(page.getByTestId('my-posts').locator('img[src="x"]')).toHaveCount(0);
});
