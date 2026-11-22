import { addDays, type ActivityTypeDto, type ClassSubjectDto, type PeriodDto, type SchoolYearDto, type TeachingAssignmentDto } from '@cdls/shared';
import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { adminApi, archiveStudents, createStudent, fixtureClass, fixtureYear } from './cleanup';
import { axeAtBothWidths, goInApp, signInAs, tokenOf, unique } from './structure';

/**
 * Report cards end to end: close a term, generate the cards of a class, write an appreciation, publish, and the
 * student reads « Bulletin du … » and downloads the PDF.
 *
 * Closing is for good once cards are published (a term with published cards cannot reopen, nor be deleted), so
 * the test never touches the demo year: it owns a one-week trimester in a fixture year (9900-9901 and after,
 * see `fixtureYear`), a class of its own there, one student with one published mark from the demo teacher. In
 * `afterAll` the student is archived and the teaching assignment removed; the class, the closed term and its
 * card stay in the fixture year, which the screens of the current year never show. Widths are set inside the
 * test, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside the test');
});

const PASSWORD = 'Obelisque-de-Louxor-2026';
const APPRECIATION = 'Travail régulier, des progrès nets en fin de trimestre.';
const made: { studentIds: string[]; assignmentIds: string[] } = { studentIds: [], assignmentIds: [] };

test.afterAll(async ({ request }) => {
  await archiveStudents(request, made.studentIds);
  const api = await adminApi(request);
  for (const id of made.assignmentIds) await api.del(`/api/teaching-assignments/${id}`);
});

test('close a term, generate, write an appreciation, publish; the student reads the card and its PDF', async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const api = await adminApi(request);

  // The term: the first free trimester number of a fixture year, one week long.
  const year = await fixtureYear(request, { freeTrimester: true });
  const used = new Set(year.periods.filter((p) => p.kind === 'trimester' && p.sectionId === null).map((p) => p.number));
  const number = [1, 2, 3, 4].find((n) => !used.has(n))!;
  const yearStart = Number(year.label.slice(0, 4));
  const startsOn = addDays(`${yearStart}-09-06`, (number - 1) * 21);
  const label = number === 1 ? '1er trimestre' : `${number}e trimestre`;
  const period = await api.post<PeriodDto>(`/api/school-years/${year.id}/periods`, {
    kind: 'trimester',
    number,
    label,
    startsOn,
    endsOn: addDays(startsOn, 6),
  });

  // The class, its subject taught by the demo teacher, and the student.
  const tag = unique('Bulletins');
  const klass = await fixtureClass(request, year, 'bac', `Classe ${tag}`);
  const subject = await api.post<ClassSubjectDto>(`/api/classes/${klass.id}/subjects`, { subjectId: 'mathematiques', coefficient: 2 });
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const me = (await (await request.get('/api/auth/me', { headers: teacher })).json()) as { teacherId: string };
  const assignment = await api.post<TeachingAssignmentDto>('/api/teaching-assignments', { teacherId: me.teacherId, classSubjectId: subject.id });
  made.assignmentIds.push(assignment.id);
  const lastName = tag.replace(' ', '');
  const created = await createStudent(request, klass.id, 'Nadia', lastName);
  const studentId = created.user.studentId!;
  made.studentIds.push(studentId);
  const studentName = `Nadia ${lastName}`;
  // The student chose a password already (the first sign-in has its own spec).
  const login = await request.post('/api/auth/login', { data: { email: created.user.email, password: created.temporaryPassword } });
  const session = (await login.json()) as { accessToken: string };
  expect(
    (await request.post('/api/auth/password', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: { currentPassword: created.temporaryPassword, newPassword: PASSWORD },
    })).status(),
  ).toBe(200);

  // One published mark in that term: 15/20 in a test.
  const types = (await (await request.get('/api/activity-types', { headers: teacher })).json()) as ActivityTypeDto[];
  const test1 = types.find((t) => t.gradable && !t.homework && !t.repeatable)!;
  const event = (await (
    await request.post('/api/events', {
      headers: teacher,
      data: { activityTypeId: test1.id, title: 'Contrôle n° 1', subjectId: 'mathematiques', classId: klass.id, date: addDays(startsOn, 1), periodId: period.id, coefficient: 1 },
    })
  ).json()) as { id: string };
  expect((await request.put(`/api/events/${event.id}/grades`, { headers: teacher, data: { entries: [{ studentId, score: 15 }] } })).ok()).toBeTruthy();
  expect((await request.post(`/api/events/${event.id}/grades/publish`, { headers: teacher, data: { published: true } })).ok()).toBeTruthy();

  // 1. The admin closes the term in « Année scolaire ».
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/annees');
  await page.getByLabel('Année affichée').selectOption(year.id);
  await page.getByRole('button', { name: `Clôturer ${label}` }).click();
  const close = page.getByRole('dialog', { name: 'Clôturer cette période ?' });
  await expect(close).toContainText('verrouille ses notes');
  await axeAtBothWidths(page);
  await close.getByRole('button', { name: 'Clôturer la période' }).click();
  await expect(close).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: label }).filter({ hasText: 'Clôturée' });
  await expect(row).toContainText('Clôturée, verrouillée');
  const closed = (await api.get<SchoolYearDto[]>('/api/school-years')).find((y) => y.id === year.id)!.periods.find((p) => p.id === period.id)!;
  expect(closed.closedAt).not.toBeNull();

  // 2. « Bulletins »: generate the class's cards.
  await goInApp(page, '/admin/bulletins');
  await expect(page.getByRole('heading', { level: 1, name: 'Bulletins' })).toBeVisible();
  await page.getByLabel('Trimestre clôturé').selectOption(period.id);
  await page.getByLabel('Classe', { exact: true }).selectOption(klass.id);
  await expect(page.getByText('Aucun bulletin pour ce choix')).toBeVisible();
  await page.locator('.page__header').getByRole('button', { name: 'Générer les bulletins' }).click();
  const generate = page.getByRole('dialog', { name: 'Générer les bulletins ?' });
  await expect(generate).toContainText(`classe Classe ${tag}`);
  await axeAtBothWidths(page);
  await generate.getByRole('button', { name: 'Générer', exact: true }).click();
  await expect(page.locator('.alert--success')).toContainText('1 bulletin généré en brouillon');
  const card = page.getByRole('row', { name: new RegExp(studentName) });
  await expect(card).toContainText('Brouillon');
  await expect(card).toContainText('15');

  // 3. The appreciation, saved.
  await card.getByLabel(`Appréciation de ${studentName}`).fill(APPRECIATION);
  await card.getByRole('button', { name: `Enregistrer l’appréciation de ${studentName}` }).click();
  await expect(card.getByRole('status')).toHaveText('Enregistrée.');
  await axeAtBothWidths(page);

  // 4. Publish: the card is no longer editable.
  await page.locator('.page__header').getByRole('button', { name: 'Publier les bulletins' }).click();
  const publish = page.getByRole('dialog', { name: 'Publier les bulletins ?' });
  await expect(publish).toContainText('visibles par les élèves');
  await publish.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(page.locator('.alert--success')).toContainText('1 bulletin publié');
  await expect(card).toContainText('Publié');
  await expect(card).toContainText(APPRECIATION);
  await expect(card.getByRole('textbox')).toHaveCount(0);
  // A term with published cards cannot be reopened.
  expect((await request.post(`/api/periods/${period.id}/close?closed=false`, { headers: api.headers })).status()).toBe(409);

  // 5. The student reads « Bulletin du … » and downloads the PDF.
  const studentContext = await browser.newContext({ locale: 'fr-FR' });
  const student = await studentContext.newPage();
  try {
    await signInAs(student, { email: created.user.email, password: PASSWORD });
    await goInApp(student, '/eleve/bulletins');
    await expect(student.getByRole('heading', { level: 1, name: 'Bulletins' })).toBeVisible();
    await expect(student.getByRole('heading', { level: 2, name: `Bulletin du ${label}` })).toBeVisible();
    await expect(student.getByText(APPRECIATION)).toBeVisible();
    await axeAtBothWidths(student);
    const [pdf] = await Promise.all([
      student.waitForResponse((r) => /\/api\/report-cards\/[^/]+\/pdf$/.test(new URL(r.url()).pathname)),
      student.getByRole('button', { name: 'Télécharger le PDF' }).click(),
    ]);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  } finally {
    await studentContext.close();
  }
});
