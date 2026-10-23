import { expect, test } from '@playwright/test';
import { addDays, type TimetableOccurrenceDto, todayIso } from '@cdls/shared';
import { ACCOUNTS } from './accounts';
import { axeAtBothWidths, goInApp, signInAs, tokenOf } from './structure';

/**
 * « Synchroniser mon agenda » and the notifications, in the student and teacher spaces: the screens pass Axe
 * at 390 and 1440 px, the bell counts what a teacher's change announces, and the link works once created.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at both widths inside each test');
});

test('student: the sync page makes a secret link, explains the three calendars and revokes it', async ({ page, request }) => {
  await signInAs(page, ACCOUNTS.student);
  await goInApp(page, '/eleve/synchroniser');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Synchroniser mon agenda');
  await expect(page.locator('.loading-line')).toHaveCount(0);
  await axeAtBothWidths(page);

  await page.getByRole('button', { name: /Créer (mon|un nouveau) lien/ }).click();
  const url = page.getByLabel('Adresse à coller dans votre agenda');
  await expect(url).toBeVisible();
  const address = await url.inputValue();
  expect(address).toMatch(/\/api\/calendar\/feed\/[0-9a-f]{32}[\w-]{43}\.ics$/);
  await expect(page.getByText('Lien actif')).toBeVisible();
  for (const name of ['Google Agenda', 'Apple Calendrier (iPhone, iPad, Mac)', 'Outlook'])
    await page.getByText(name, { exact: true }).click();
  await axeAtBothWidths(page);

  // The calendar app reads it without any session: a real calendar of the student's own class.
  const feed = await request.get(new URL(address).pathname);
  expect(feed.status()).toBe(200);
  expect(feed.headers()['content-type']).toContain('text/calendar');
  expect(await feed.text()).toContain('BEGIN:VCALENDAR');

  // Revoking asks first (Escape keeps it), then the address stops working.
  await page.getByRole('button', { name: 'Désactiver le lien' }).click();
  await expect(page.getByRole('dialog', { name: 'Désactiver le lien ?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Désactiver le lien' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Désactiver le lien' }).click();
  await expect(page.getByText('Aucun lien actif')).toBeVisible();
  expect((await request.get(new URL(address).pathname)).status()).toBe(404);
});

test('teacher: the sync page opens and passes Axe', async ({ page }) => {
  await signInAs(page, ACCOUNTS.teacher);
  await goInApp(page, '/enseignant/synchroniser');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Synchroniser mon agenda');
  await expect(page.locator('.loading-line')).toHaveCount(0);
  await axeAtBothWidths(page);
});

test('a cancelled session reaches the student’s bell and list, and can be read from the keyboard', async ({ page, request }) => {
  // The maths teacher cancels one of their sessions in the student's class (the student of the demo is in 1re secondaire).
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const me = (await (await request.get('/api/auth/me', { headers: teacher })).json()) as { teacherId: string };
  const today = todayIso();
  const sessions = (await (
    await request.get(`/api/timetable/occurrences?teacherId=${me.teacherId}&from=${addDays(today, 28)}&to=${addDays(today, 60)}`, { headers: teacher })
  ).json()) as TimetableOccurrenceDto[];
  const target = sessions.find((s) => s.status === 'normal' && s.classLabel.includes('1re secondaire') && !s.groupId);
  expect(target, 'a future session of the student’s class').toBeTruthy();
  const cancelled = await request.post(`/api/timetable/slots/${target!.slotId}/exceptions`, {
    headers: teacher,
    data: { date: target!.originalDate, kind: 'cancelled', reason: 'Conseil de classe' },
  });
  expect(cancelled.status()).toBe(201);

  try {
    await signInAs(page, ACCOUNTS.student);
    const bell = page.getByRole('link', { name: /^Notifications, \d+ non lues?$/ });
    await expect(bell).toBeVisible();
    await axeAtBothWidths(page);

    // The bell is reachable by keyboard and opens the list.
    await bell.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname === '/eleve/notifications');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
    await expect(page.locator('.loading-line')).toHaveCount(0);
    const item = page.getByRole('listitem').filter({ hasText: 'séance' }).first();
    await expect(item).toContainText('annulée');
    await expect(item).toContainText('Motif : Conseil de classe');
    await axeAtBothWidths(page);

    // Marking one read lowers the count in the bell; « Tout marquer comme lu » clears it.
    const before = Number(/(\d+) non lue/.exec((await bell.getAttribute('aria-label')) ?? '')?.[1]);
    await item.getByRole('button', { name: /Marquer comme lue/ }).click();
    await expect(page.getByRole('link', { name: before > 1 ? `Notifications, ${before - 1} non lue${before - 1 > 1 ? 's' : ''}` : 'Notifications, aucune non lue' })).toBeVisible();
    if (before > 1) {
      await page.getByRole('button', { name: 'Tout marquer comme lu' }).click();
      await expect(page.getByRole('link', { name: 'Notifications, aucune non lue' })).toBeVisible();
    }

    // The e-mail preference is off by default, and saving it says so.
    const mail = page.getByLabel('Recevoir aussi ces notifications par e-mail');
    await expect(mail).not.toBeChecked();
    await mail.check();
    await expect(page.getByText('vous recevrez aussi les notifications par e-mail')).toBeVisible();
    await mail.uncheck();
    await expect(page.getByText('plus d’e-mail')).toBeVisible();
  } finally {
    // Back to the timetable as it was.
    const ex = (await (
      await request.get(`/api/timetable/occurrences?teacherId=${me.teacherId}&from=${target!.originalDate}&to=${target!.originalDate}`, { headers: teacher })
    ).json()) as TimetableOccurrenceDto[];
    const id = ex.find((s) => s.slotId === target!.slotId && s.status === 'cancelled')?.exceptionId;
    if (id) await request.delete(`/api/timetable/exceptions/${id}`, { headers: teacher });
  }
});

test('teacher: the notifications page and the bell pass Axe', async ({ page }) => {
  await signInAs(page, ACCOUNTS.teacher);
  await expect(page.getByRole('link', { name: /^Notifications, / })).toBeVisible();
  await goInApp(page, '/enseignant/notifications');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
  await expect(page.locator('.loading-line')).toHaveCount(0);
  await axeAtBothWidths(page);
});
