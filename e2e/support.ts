import { expect, type Page } from '@playwright/test';

/** Helpers for the school-space tests, which run against the Firebase emulators. */

export const PASSWORD = 'motdepasse123';
const PROJECT = 'demo-lasalle';

export function uniqueEmail(tag: string): string {
  return `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.org`;
}

/** Empties the Firestore emulator, so each test starts from an empty school (accounts live in Auth, not here). */
export async function clearFirestore(): Promise<void> {
  const res = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  expect(res.ok, 'Firestore emulator cleared').toBe(true);
}

/** Adds an e-mail to the teachers allow-list (what the administrator does in the Firebase console). */
export async function allowTeacher(email: string): Promise<void> {
  const res = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/teachers/${encodeURIComponent(email.toLowerCase())}`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { name: { stringValue: 'Test' } } }),
    },
  );
  expect(res.ok, 'teacher added to the allow-list').toBe(true);
}

/** Clicks the verification link the Auth emulator "sent" to this e-mail (what the teacher does in their mailbox). */
export async function verifyEmail(email: string): Promise<void> {
  const res = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes } = (await res.json()) as { oobCodes: { email: string; requestType: string; oobCode: string }[] };
  const code = oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').at(-1);
  expect(code, `a verification code for ${email}`).toBeDefined();
  const done = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code!.oobCode }),
  });
  expect(done.ok, 'e-mail verified').toBe(true);
}

export async function registerStudent(
  page: Page,
  opts: { name: string; email: string; section: 'nationale' | 'bac'; classe: string },
): Promise<void> {
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

/** Creates a teacher account (allow-listed, e-mail verified) and lands in the teacher's dashboard. */
export async function registerTeacher(page: Page, opts: { name: string; email: string }): Promise<void> {
  await allowTeacher(opts.email);
  await page.goto('/espace-enseignant');
  await page.getByTestId('tab-register').click();
  await page.getByLabel('Nom et prénom').fill(opts.name);
  await page.getByLabel('Adresse e-mail').fill(opts.email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByTestId('unverified')).toBeVisible();
  await verifyEmail(opts.email);
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('teacher-dashboard')).toBeVisible();
}

/** A day relative to today (local), YYYY-MM-DD: what the date inputs and the calendar use. */
export function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface EventInput {
  kind: 'cours' | 'td' | 'tp' | 'examen' | 'controle' | 'devoir' | 'revision' | 'activite' | 'reunion';
  title: string;
  target?: string;
  subject?: string;
  date?: string;
  start?: string;
  end?: string;
  weeklyUntil?: string;
  place?: string;
  description?: string;
  coefficient?: string;
  links?: { label: string; url: string }[];
}

/** What a teacher does with « + Ajouter un événement ». */
export async function addEvent(page: Page, e: EventInput): Promise<void> {
  await page.getByTestId('new-event').click();
  const form = page.getByTestId('event-form');
  await expect(form).toBeVisible();
  await form.getByTestId(`kind-${e.kind}`).click();
  await form.getByLabel('Titre').fill(e.title);
  if (e.subject) await form.getByTestId('ef-subject').selectOption({ label: e.subject });
  await form.getByTestId('ef-target').selectOption({ label: e.target ?? 'Tous les élèves' });
  await form.getByTestId('ef-date').fill(e.date ?? isoDay());
  if (e.start) await form.getByTestId('ef-start').fill(e.start);
  if (e.end) await form.getByTestId('ef-end').fill(e.end);
  if (e.weeklyUntil) {
    await form.getByTestId('ef-weekly').check();
    await form.getByTestId('ef-until').fill(e.weeklyUntil);
  }
  if (e.place) await form.getByTestId('ef-place').fill(e.place);
  if (e.coefficient) await form.getByTestId('ef-coef').fill(e.coefficient);
  if (e.description) await form.getByTestId('ef-description').fill(e.description);
  for (const [i, link] of (e.links ?? []).entries()) {
    await form.getByTestId('ef-att-add').click();
    await form.getByTestId('ef-att-label').nth(i).fill(link.label);
    await form.getByTestId('ef-att-url').nth(i).fill(link.url);
  }
  await form.getByTestId('ef-save').click();
  await expect(form).toBeHidden();
}

/** What a teacher does in the « Annonces » card. */
export async function announce(page: Page, a: { title: string; body?: string; target?: string }): Promise<void> {
  const card = page.getByTestId('announcements');
  await card.getByLabel('Titre').fill(a.title);
  await card.getByLabel('Message').fill(a.body ?? '');
  await card.getByTestId('post-target').selectOption({ label: a.target ?? 'Tous les élèves' });
  await card.getByTestId('publish').click();
  await expect(card.getByTestId('form-message')).toContainText('Annonce publiée');
}
