import { expect, type Browser, type Page, test } from '@playwright/test';
import { clearFirestore, registerStudent, registerTeacher, uniqueEmail } from './support';

/*
 * The shared calendar: teachers add, move and delete exams, activities and meetings by class; students
 * see only what concerns them and cannot edit anything.
 */

test.beforeEach(clearFirestore);

const freshPage = async (browser: Browser): Promise<Page> => (await browser.newContext({ locale: 'fr' })).newPage();

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Selects a day in the calendar, browsing to the next month if it is not in view. */
async function showDay(page: Page, day: string): Promise<void> {
  const button = page.locator(`button[data-day="${day}"]`);
  if (!(await button.count())) await page.getByTestId('cal-next').click();
  await button.click();
}

async function addEvent(page: Page, e: { kind: 'exam' | 'activity' | 'meeting'; title: string; target: string; time?: string; note?: string }): Promise<void> {
  await page.getByTestId(`kind-${e.kind}`).click();
  await page.getByLabel('Titre').fill(e.title);
  await page.getByTestId('ev-target').selectOption({ label: e.target });
  if (e.time) await page.getByLabel('Heure (facultatif)').fill(e.time);
  if (e.note) await page.getByLabel('Détails (salle, programme…)').fill(e.note);
  await page.getByTestId('cal-save').click();
  await expect(page.getByTestId('form-message')).toContainText('Ajouté');
}

test('teachers manage the calendar by class; students see theirs, read-only, live', async ({ browser }) => {
  const teacher = await freshPage(browser);
  const sara = await freshPage(browser);
  const omar = await freshPage(browser);
  await registerTeacher(teacher, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await registerStudent(sara, { name: 'Sara Ibrahim', email: uniqueEmail('sara'), section: 'bac', classe: 'Première' });
  await registerStudent(omar, { name: 'Omar Khalil', email: uniqueEmail('omar'), section: 'nationale', classe: '3e secondaire (Thanaweya Amma)' });
  await sara.getByTestId('tab-calendar').click();
  await omar.getByTestId('tab-calendar').click();
  await expect(sara.getByTestId('cal-empty')).toBeVisible();

  await teacher.getByTestId('tab-calendar').click();
  await expect(teacher.getByTestId('cal-title')).toHaveText(/\d{4}$/);
  await addEvent(teacher, { kind: 'exam', title: 'Examen de mathématiques', target: 'Bac français — Première', time: '08:30', note: 'Salle 12' });
  await addEvent(teacher, { kind: 'activity', title: 'Club de théâtre', target: 'Bac français — Terminale' });
  await addEvent(teacher, { kind: 'meeting', title: 'Réunion parents-professeurs', target: 'Tous les élèves', time: '17:00' });

  // The teacher sees everything, and can filter by class.
  const teacherTitles = teacher.getByTestId('cal-day').getByTestId('cal-event-title');
  await expect(teacherTitles).toHaveText(['Club de théâtre', 'Examen de mathématiques', 'Réunion parents-professeurs']);
  await teacher.getByTestId('cal-filter').selectOption({ label: 'Bac français — Première' });
  await expect(teacherTitles).toHaveText(['Examen de mathématiques', 'Réunion parents-professeurs']);
  await teacher.getByTestId('cal-filter').selectOption({ label: 'Tous les élèves' });

  // Sara (Première) sees the exam and the meeting, live, with no way to edit.
  const saraTitles = sara.getByTestId('cal-day').getByTestId('cal-event-title');
  await expect(saraTitles).toHaveText(['Examen de mathématiques', 'Réunion parents-professeurs']);
  await expect(sara.getByTestId('cal-event').first()).toContainText('08:30');
  await expect(sara.getByTestId('cal-event').first()).toContainText('Salle 12');
  await expect(sara.getByTestId('cal-form')).toHaveCount(0);
  await expect(sara.getByTestId('cal-edit')).toHaveCount(0);
  await expect(sara.getByTestId('cal-delete')).toHaveCount(0);
  await expect(sara.getByTestId('cal-filter')).toHaveCount(0);

  // Omar (other section) sees only the meeting for everyone.
  await expect(omar.getByTestId('cal-day').getByTestId('cal-event-title')).toHaveText(['Réunion parents-professeurs']);

  // Moving the exam to tomorrow: the student sees it there, and no longer today.
  const tomorrow = isoDay(1);
  await teacher.getByTestId('cal-event').filter({ hasText: 'Examen de mathématiques' }).getByTestId('cal-edit').click();
  await teacher.getByTestId('ev-date').fill(tomorrow);
  await teacher.getByTestId('cal-save').click();
  await expect(teacher.getByTestId('form-message')).toHaveText('Événement modifié.');
  await expect(saraTitles).toHaveText(['Réunion parents-professeurs']);
  await showDay(sara, tomorrow);
  await expect(saraTitles).toHaveText(['Examen de mathématiques']);
  await showDay(sara, isoDay(0));
  await expect(saraTitles).toHaveText(['Réunion parents-professeurs']);

  // Deleting it removes it for the student.
  await teacher.getByTestId('cal-event').filter({ hasText: 'Examen de mathématiques' }).getByTestId('cal-delete').click();
  await showDay(sara, tomorrow);
  await expect(sara.getByTestId('cal-empty')).toBeVisible();

  await teacher.context().close();
  await sara.context().close();
  await omar.context().close();
});

test('the calendar form explains what is missing; months can be browsed', async ({ browser }) => {
  const teacher = await freshPage(browser);
  await registerTeacher(teacher, { name: 'Léa Martin', email: uniqueEmail('lea') });
  await teacher.getByTestId('tab-calendar').click();
  await teacher.getByTestId('cal-save').click();
  await expect(teacher.getByText('Saisissez un titre.')).toBeVisible();

  const start = (await teacher.getByTestId('cal-title').textContent())!;
  await teacher.getByTestId('cal-next').click();
  await expect(teacher.getByTestId('cal-title')).not.toHaveText(start);
  await teacher.getByTestId('cal-today').click();
  await expect(teacher.getByTestId('cal-title')).toHaveText(start);
  await teacher.context().close();
});
