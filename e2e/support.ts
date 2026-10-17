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
