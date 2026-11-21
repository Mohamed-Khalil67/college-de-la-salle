import { addDays, type ClassDto, type ClassSubjectDto, type TimetableSlotDto } from '@cdls/shared';
import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { adminApi } from './cleanup';
import { firstTeachingWeek } from './school-weeks';
import { axeAtBothWidths, goInApp, signInAs } from './structure';

/**
 * The timetable editor refuses a weekly slot that puts a class in two places at once: the conflict is named,
 * free times are offered, and one click on a suggestion saves the slot there. The series starts in the first
 * school week with lessons (never a holiday), so the test passes on any day of the year; the slot is deleted
 * afterwards. Widths are set inside the test, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside the test');
});

interface SlotPage {
  readonly items: readonly TimetableSlotDto[];
}

test('a clashing slot is refused with the conflict explained; a suggested time saves it', async ({ page, request }) => {
  test.setTimeout(150_000);
  const api = await adminApi(request);
  const classes = await api.get<ClassDto[]>('/api/classes');
  // A class with a plain weekly slot (whole class, every week), and another subject of it that has a teacher.
  let found: { klass: ClassDto; slot: TimetableSlotDto; other: ClassSubjectDto } | undefined;
  for (const klass of classes) {
    const slots = (await api.get<SlotPage>(`/api/timetable/slots?classId=${klass.id}&pageSize=100`)).items;
    const slot = slots.find((s) => !s.groupId && !s.division && !s.weekParity);
    const other = (await api.get<ClassSubjectDto[]>(`/api/classes/${klass.id}/subjects`)).find(
      (s) => s.id !== slot?.classSubjectId && s.teachers.length > 0,
    );
    if (slot && other) {
      found = { klass, slot, other };
      break;
    }
  }
  expect(found, 'a class with a weekly slot and a second subject').toBeTruthy();
  const { klass, slot, other } = found!;
  const before = new Set((await api.get<SlotPage>(`/api/timetable/slots?classId=${klass.id}&pageSize=100`)).items.map((s) => s.id));
  const week = await firstTeachingWeek(request, api.headers, `classId=${klass.id}`);
  const validFrom = week;
  const validTo = addDays(week, 27);

  try {
    await signInAs(page, ACCOUNTS.admin);
    await goInApp(page, '/admin/emploi-du-temps');
    await expect(page.getByRole('heading', { level: 1, name: 'Emploi du temps' })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter une séance' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Ajouter une séance' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Classe').selectOption(klass.id);
    await dialog.getByLabel('Matière').selectOption(other.id);
    await dialog.getByLabel('Enseignant').selectOption(other.teachers[0]!.teacherId);
    await dialog.getByLabel('Jour').selectOption(String(slot.weekday));
    await dialog.getByLabel('Salle').selectOption('');
    await dialog.getByLabel('Début').fill(slot.startTime);
    await dialog.getByLabel('Fin').fill(slot.endTime);
    await dialog.getByLabel('À partir du').fill(validFrom);
    await dialog.getByLabel('Jusqu’au').fill(validTo);
    await dialog.getByRole('button', { name: 'Ajouter la séance' }).click();

    // Refused: the conflict is named, nothing is saved, and the free times take the focus.
    const conflict = dialog.getByRole('alert').filter({ hasText: /déjà/ });
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText(klass.label.split(' (')[0]!);
    const ways = dialog.getByRole('heading', { name: 'Choisir une place libre' });
    await expect(ways).toBeFocused();
    const times = dialog.getByRole('list', { name: 'Un autre moment de la semaine, chaque semaine' });
    await expect(times.getByRole('button').first()).toBeVisible();
    expect((await api.get<SlotPage>(`/api/timetable/slots?classId=${klass.id}&pageSize=100`)).items.filter((s) => !before.has(s.id))).toEqual([]);
    await axeAtBothWidths(page);

    // One click on the first free time saves the slot there (accepting the soft warnings with a reason, if any).
    const choice = (await times.getByRole('button').first().innerText()).trim();
    await times.getByRole('button').first().click();
    const done = page.locator('.alert--success').filter({ hasText: /nregistr/ });
    const accept = dialog.getByRole('button', { name: 'Enregistrer avec ces avertissements' });
    await expect(accept.or(done)).toBeVisible();
    if (await accept.isVisible()) {
      const reasons = dialog.getByLabel(/^Motif : /);
      for (let i = 0; i < (await reasons.count()); i++) await reasons.nth(i).fill('Accepté pour le test');
      await accept.click();
    }
    await expect(done).toBeVisible();
    await expect(dialog).toBeHidden();

    // Saved once, at another moment than the lesson it clashed with.
    const added = (await api.get<SlotPage>(`/api/timetable/slots?classId=${klass.id}&pageSize=100`)).items.filter((s) => !before.has(s.id));
    expect(added, `one slot saved at « ${choice} »`).toHaveLength(1);
    const saved = added[0]!;
    expect(saved.classSubjectId).toBe(other.id);
    expect(saved.weekday !== slot.weekday || saved.startTime >= slot.endTime || saved.endTime <= slot.startTime).toBe(true);
  } finally {
    const after = (await api.get<SlotPage>(`/api/timetable/slots?classId=${klass.id}&pageSize=100`)).items;
    for (const s of after.filter((x) => !before.has(x.id))) await api.del(`/api/timetable/slots/${s.id}?scope=all`);
  }
});
