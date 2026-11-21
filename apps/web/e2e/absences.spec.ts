import { type ActivityTypeDto, type EventDto, type TeachingAssignmentDto, type UserDto } from '@cdls/shared';
import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { adminApi } from './cleanup';
import { latestTeachingDay } from './school-weeks';
import { axeAtBothWidths, goInApp, signInAs, tokenOf, unique } from './structure';

/**
 * « Appel » to « Absences »: the teacher marks a student absent at the roll call of a session, and the student's
 * Absences page lists it with the right day and subject. The session is a one-off course of the test's own, in
 * the evening of the last school day with lessons (a weekend or a holiday is never picked), so the demo events
 * keep their roll calls; deleting it in `finally` deletes the roll call with it. Widths are set inside the
 * test, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside the test');
});

/** « Dimanche 15 novembre »: the day as the pages write it. */
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

test('an absence recorded at « Appel » shows on the student’s Absences page', async ({ page, browser, request }) => {
  test.setTimeout(150_000);
  const api = await adminApi(request);
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const assignment = ((await (await request.get('/api/teaching-assignments', { headers: teacher })).json()) as TeachingAssignmentDto[])[0]!;
  const students = (await api.get<{ items: UserDto[] }>('/api/users?role=student&status=active&mustChangePassword=false&pageSize=100')).items;
  const student = students.find((s) => s.classId === assignment.classId && s.studentNumber?.startsWith('CDLS-'));
  expect(student, 'a seeded student of the teacher’s class').toBeTruthy();
  const name = `${student!.firstName} ${student!.lastName}`;
  const types = (await (await request.get('/api/activity-types', { headers: teacher })).json()) as ActivityTypeDto[];
  const course = types.find((t) => t.repeatable && !t.gradable && !t.homework && !t.archived)!;
  const day = await latestTeachingDay(request, teacher, `classId=${assignment.classId}`);
  const title = unique('Soutien');
  const created = await request.post('/api/events', {
    headers: teacher,
    data: { activityTypeId: course.id, title, subjectId: assignment.subjectId, classId: assignment.classId, date: day, startTime: '19:00', endTime: '19:45' },
  });
  expect(created.status(), await created.text()).toBe(201);
  const event = (await created.json()) as EventDto;

  try {
    // The teacher's roll call for that session.
    await signInAs(page, ACCOUNTS.teacher);
    await goInApp(page, `/enseignant/appel?classe=${assignment.classId}`);
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(`Appel de la classe ${assignment.classLabel}`) })).toBeVisible();
    await page.getByLabel('Jour').fill(day);
    const session = page.getByLabel('Séance');
    await expect(session.locator('option', { hasText: title })).toHaveCount(1);
    await session.selectOption({ label: (await session.locator('option', { hasText: title }).innerText()).trim() });
    const status = page.getByRole('group', { name: `Présence de ${name}` });
    await expect(status).toBeVisible();
    await status.getByRole('radio', { name: 'Absent' }).check({ force: true });
    await page.getByLabel(`Remarque pour ${name}`).fill('Non excusé (test Playwright)');
    await axeAtBothWidths(page);
    await page.getByRole('button', { name: 'Enregistrer l’appel' }).click();
    await expect(page.getByText(/Appel enregistré/)).toBeVisible();

    // The student's Absences page: the day, the subject, « Absent » and the remark.
    const studentContext = await browser.newContext({ locale: 'fr-FR' });
    const studentPage = await studentContext.newPage();
    try {
      await signInAs(studentPage, { email: student!.email, password: ACCOUNTS.student.password });
      await goInApp(studentPage, '/eleve/absences');
      await expect(studentPage.getByRole('heading', { level: 1, name: 'Absences' })).toBeVisible();
      const row = studentPage.getByRole('row').filter({ hasText: 'Non excusé (test Playwright)' });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole('rowheader')).toHaveText(new RegExp(dayLabel(day), 'i'));
      await expect(row).toContainText(assignment.subjectName);
      await expect(row).toContainText('19 h');
      await expect(row).toContainText('Absent');
      await axeAtBothWidths(studentPage);
    } finally {
      await studentContext.close();
    }
  } finally {
    // Deleting the event deletes its roll call.
    await request.delete(`/api/events/${event.id}`, { headers: teacher });
  }
});
