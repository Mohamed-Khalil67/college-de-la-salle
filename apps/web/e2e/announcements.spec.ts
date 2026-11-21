import type { PostDto, TeachingAssignmentDto, UserDto } from '@cdls/shared';
import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { adminApi } from './cleanup';
import { axeAtBothWidths, goInApp, signInAs, tokenOf, unique } from './structure';

/**
 * A teacher's announcement to one class: a student of that class finds it on their home page, a student of
 * another class does not (neither on the home page nor on « Annonces »). The teacher deletes it at the end,
 * and `finally` deletes it through the API if the test stopped before. Widths are set inside the test, so
 * the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside the test');
});

test('an announcement to one class reaches its students only', async ({ page, browser, request }) => {
  test.setTimeout(150_000);
  const api = await adminApi(request);
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const classId = ((await (await request.get('/api/teaching-assignments', { headers: teacher })).json()) as TeachingAssignmentDto[])[0]!.classId;
  const students = (await api.get<{ items: UserDto[] }>('/api/users?role=student&status=active&mustChangePassword=false&pageSize=100')).items;
  // Seeded students (the demo password works for them all): one in the class, one elsewhere.
  const seeded = students.filter((s) => s.studentNumber?.startsWith('CDLS-'));
  const inClass = seeded.find((s) => s.classId === classId);
  const elsewhere = seeded.find((s) => s.classId && s.classId !== classId);
  expect(inClass && elsewhere, 'two seeded students, one in the class and one outside').toBeTruthy();
  const title = unique('Sortie au musée');
  const body = 'Rendez-vous devant le collège à 8 h, avec une tenue confortable.';

  try {
    // The teacher writes it for that class.
    await signInAs(page, ACCOUNTS.teacher);
    await goInApp(page, '/enseignant/annonces');
    await expect(page.getByRole('heading', { level: 1, name: 'Annonces' })).toBeVisible();
    await page.getByRole('button', { name: 'Publier l’annonce' }).click();
    await expect(page.getByText('Donnez un titre à l’annonce.')).toBeVisible();
    await expect(page.getByText('Choisissez à qui s’adresse l’annonce.')).toBeVisible();
    await axeAtBothWidths(page);
    await page.getByLabel('Titre').fill(title);
    await page.getByLabel('Pour qui ?').selectOption(`class:${classId}`);
    await page.getByLabel('Message').fill(body);
    await page.getByRole('button', { name: 'Publier l’annonce' }).click();
    const mine = page.getByRole('listitem').filter({ hasText: title });
    await expect(mine).toBeVisible();
    await axeAtBothWidths(page);

    // A student of the class: on the home page's « Annonces » block.
    const insideContext = await browser.newContext({ locale: 'fr-FR' });
    const inside = await insideContext.newPage();
    try {
      await signInAs(inside, { email: inClass!.email, password: ACCOUNTS.student.password });
      await expect(inside).toHaveURL(/\/eleve$/);
      const block = inside.getByRole('region', { name: 'Annonces', exact: true });
      await expect(block).toContainText(title);
      await axeAtBothWidths(inside);
    } finally {
      await insideContext.close();
    }

    // A student of another class: not on the home page, not in the list either.
    const outsideContext = await browser.newContext({ locale: 'fr-FR' });
    const outside = await outsideContext.newPage();
    try {
      await signInAs(outside, { email: elsewhere!.email, password: ACCOUNTS.student.password });
      const block = outside.getByRole('region', { name: 'Annonces', exact: true });
      await expect(block.locator('.loading-line')).toHaveCount(0);
      await expect(block).toBeVisible();
      await expect(block).not.toContainText(title);
      await goInApp(outside, '/eleve/annonces');
      await expect(outside.getByRole('heading', { level: 1, name: 'Annonces' })).toBeVisible();
      await expect(outside.locator('.loading-line')).toHaveCount(0);
      await expect(outside.getByText(title)).toHaveCount(0);
    } finally {
      await outsideContext.close();
    }

    // The teacher deletes it.
    await mine.getByRole('button', { name: `Supprimer l’annonce « ${title} »` }).click();
    const confirm = page.getByRole('dialog', { name: 'Supprimer l’annonce ?' });
    await confirm.getByRole('button', { name: 'Supprimer' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
  } finally {
    const posts = (await (await request.get('/api/posts?pageSize=100', { headers: teacher })).json()) as { items: PostDto[] };
    for (const p of posts.items.filter((x) => x.title === title)) await request.delete(`/api/posts/${p.id}`, { headers: teacher });
  }
});
