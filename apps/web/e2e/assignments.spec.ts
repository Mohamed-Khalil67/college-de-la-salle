import type { ClassDto, ClassSubjectDto, TeachingAssignmentDto } from '@cdls/shared';
import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { adminApi } from './cleanup';
import { axeAtBothWidths, goInApp, signInAs, tokenOf } from './structure';

/**
 * « Affectations » (/admin/affectations): the admin gives the demo teacher a subject they do not teach in a
 * class, the teacher finds it in « Mes classes », the admin removes it and it is gone again.
 * The class already has the subject (taught by someone else), so no class subject is created; the assignment
 * is removed in `finally` if the test stops half way. Widths are set inside the test, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside the test');
});

test('assign a teacher to a class subject, see it on the teacher’s classes, remove it', async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const api = await adminApi(request);
  const teacherAuth = await tokenOf(request, ACCOUNTS.teacher);
  const me = (await (await request.get('/api/auth/me', { headers: teacherAuth })).json()) as { teacherId: string; firstName: string; lastName: string };
  const teacherName = `${me.firstName} ${me.lastName}`;
  const classes = await api.get<ClassDto[]>('/api/classes');
  // A subject of a class that the teacher does not teach (someone else does): prefer a class they do not teach at all.
  const candidates: { klass: ClassDto; subject: ClassSubjectDto }[] = [];
  for (const klass of classes)
    for (const subject of await api.get<ClassSubjectDto[]>(`/api/classes/${klass.id}/subjects`))
      if (!subject.teachers.some((t) => t.teacherId === me.teacherId)) candidates.push({ klass, subject });
  const own = await api.get<TeachingAssignmentDto[]>(`/api/teaching-assignments?teacherId=${me.teacherId}`);
  const taught = new Set(own.map((a) => a.classId));
  const target = candidates.find((c) => !taught.has(c.klass.id)) ?? candidates[0];
  expect(target, 'a class subject the demo teacher does not teach').toBeTruthy();
  const { klass, subject } = target!;
  const alreadyThere = taught.has(klass.id);

  const teacherContext = await browser.newContext({ locale: 'fr-FR' });
  const teacher = await teacherContext.newPage();
  try {
    await signInAs(page, ACCOUNTS.admin);
    await goInApp(page, '/admin/affectations');
    await expect(page.getByRole('heading', { level: 1, name: 'Affectations' })).toBeVisible();
    await expect(page.locator('.loading-line')).toHaveCount(0);

    await page.getByRole('button', { name: 'Nouvelle affectation' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nouvelle affectation' });
    await expect(dialog).toBeVisible();
    // Nothing chosen: each field says what is missing.
    await dialog.getByRole('button', { name: 'Créer l’affectation' }).click();
    await expect(dialog.getByText('Choisissez l’enseignant.')).toBeVisible();
    await expect(dialog.getByText('Choisissez la classe.')).toBeVisible();
    await axeAtBothWidths(page);

    await dialog.getByLabel('Enseignant').selectOption(me.teacherId);
    await dialog.getByLabel('Classe').selectOption(klass.id);
    await dialog.getByLabel('Matière').selectOption(subject.subjectId);
    await dialog.getByRole('button', { name: 'Créer l’affectation' }).click();
    await expect(dialog).toBeHidden();

    // The row, in the list filtered on the teacher.
    await page.getByRole('search', { name: 'Filtrer les affectations' }).getByLabel('Enseignant').selectOption(me.teacherId);
    const row = page.getByRole('row').filter({ hasText: teacherName }).filter({ hasText: klass.label }).filter({ hasText: subject.subjectName });
    await expect(row).toHaveCount(1);
    await axeAtBothWidths(page);

    // The teacher sees the class, with that subject, in « Mes classes ».
    await signInAs(teacher, ACCOUNTS.teacher);
    await goInApp(teacher, '/enseignant/classes');
    const card = teacher.getByRole('region', { name: klass.label, exact: true });
    await expect(card).toBeVisible();
    await expect(card.getByText(subject.subjectName, { exact: true })).toBeVisible();
    await axeAtBothWidths(teacher);

    // The admin removes it, behind a confirmation that names what it does.
    await row.getByRole('button', { name: `Supprimer l’affectation ${subject.subjectName}, ${klass.label}` }).click();
    const confirm = page.getByRole('dialog', { name: 'Supprimer cette affectation ?' });
    await expect(confirm).toContainText(teacherName);
    await expect(confirm).toContainText('Les notes déjà saisies sont conservées');
    await axeAtBothWidths(page);
    await confirm.getByRole('button', { name: 'Supprimer l’affectation' }).click();
    await expect(confirm).toBeHidden();
    await expect(row).toHaveCount(0);

    // Gone from the teacher's classes after a reload.
    await teacher.reload();
    await expect(teacher.getByRole('heading', { level: 1, name: 'Mes classes' })).toBeVisible();
    await expect(teacher.locator('.loading-line')).toHaveCount(0);
    const after = teacher.getByRole('region', { name: klass.label, exact: true });
    if (alreadyThere) await expect(after.getByText(subject.subjectName, { exact: true })).toHaveCount(0);
    else await expect(after).toHaveCount(0);
  } finally {
    await teacherContext.close();
    const left = await api.get<TeachingAssignmentDto[]>(`/api/teaching-assignments?teacherId=${me.teacherId}`);
    for (const a of left.filter((x) => x.classSubjectId === subject.id)) await api.del(`/api/teaching-assignments/${a.id}`);
  }
});
