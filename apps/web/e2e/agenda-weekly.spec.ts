import { addDays, type ActivityTypeDto, type EventDto, type TeachingAssignmentDto, type TimetableOccurrenceDto } from '@cdls/shared';
import { expect, type Page, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { twoTeachingWeeks, weeksAhead } from './school-weeks';
import { axeAtBothWidths, goInApp, signInAs, tokenOf, unique } from './structure';

/**
 * A teacher's weekly event in « Agenda »: created with « Chaque semaine », seen on two weeks in a row, edited,
 * then deleted for every week. The weeks are the first two school weeks with lessons (never the holidays), so
 * the test passes on any day of the year; whatever is left is deleted in `finally`. Widths are set inside the
 * test, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside the test');
});

const event = (page: Page, title: string) => page.locator('app-week-view').getByRole('button', { name: new RegExp(title) });

test('a weekly course: created, seen on two weeks, edited, deleted', async ({ page, request }) => {
  test.setTimeout(150_000);
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const me = (await (await request.get('/api/auth/me', { headers: teacher })).json()) as { teacherId: string };
  const assignment = ((await (await request.get('/api/teaching-assignments', { headers: teacher })).json()) as TeachingAssignmentDto[])[0]!;
  const types = (await (await request.get('/api/activity-types', { headers: teacher })).json()) as ActivityTypeDto[];
  const course = types.find((t) => t.repeatable && !t.gradable && !t.homework && !t.archived)!;
  // A day of the first week whose next-week twin is a school day too (a holiday can start mid-week).
  const [first, second] = await twoTeachingWeeks(request, teacher, `teacherId=${me.teacherId}`);
  const lessons = (await (
    await request.get(`/api/timetable/occurrences?teacherId=${me.teacherId}&from=${first}&to=${addDays(second, 6)}`, { headers: teacher })
  ).json()) as TimetableOccurrenceDto[];
  const days = new Set(lessons.filter((l) => l.status === 'normal').map((l) => l.originalDate));
  const day = [...days].sort().find((d) => d < second && days.has(addDays(d, 7)));
  expect(day, 'a school day in both weeks').toBeTruthy();
  const title = unique('Atelier');
  const renamed = `${title} en salle info`;

  try {
    await signInAs(page, ACCOUNTS.teacher);
    await goInApp(page, '/enseignant/agenda');
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible();

    await page.getByRole('button', { name: 'Nouvel événement' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouvel événement' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Type').selectOption(course.id);
    await dialog.getByLabel('Titre').fill(title);
    await dialog.getByLabel('Classe et matière').selectOption(assignment.id);
    await dialog.getByLabel('Date').fill(day!);
    await dialog.getByLabel('Début').fill('19:00');
    await dialog.getByLabel('Fin').fill('19:45');
    await dialog.getByLabel('Chaque semaine (un créneau d’emploi du temps)').check();
    // The repetition needs an end, which says how to fix it.
    await dialog.getByRole('button', { name: 'Créer l’événement' }).click();
    await expect(dialog.getByText('Indiquez jusqu’à quand l’événement se répète.')).toBeVisible();
    await axeAtBothWidths(page);
    await dialog.getByLabel('Jusqu’au').fill(addDays(day!, 14));
    await dialog.getByRole('button', { name: 'Créer l’événement' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.alert--success')).toContainText(`« ${title} » est enregistré dans l’agenda.`);

    // The page shows the event's week; it is there, and on the next week too.
    await expect(page.locator(`section[aria-labelledby="jour-${day}"]`).getByRole('button', { name: new RegExp(title) })).toBeVisible();
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    await expect(page.locator(`section[aria-labelledby="jour-${addDays(day!, 7)}"]`).getByRole('button', { name: new RegExp(title) })).toBeVisible();
    await axeAtBothWidths(page);

    // Edit it (the whole series): the new title shows on both weeks.
    await event(page, title).click();
    const details = page.getByRole('dialog', { name: title });
    await expect(details).toBeVisible();
    await axeAtBothWidths(page);
    await details.getByRole('button', { name: 'Modifier' }).click();
    const edit = page.getByRole('dialog', { name: 'Modifier l’événement' });
    await expect(edit.getByLabel('Titre')).toHaveValue(title);
    await expect(edit.getByLabel('Chaque semaine (un créneau d’emploi du temps)')).toBeChecked();
    await edit.getByLabel('Titre').fill(renamed);
    await edit.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(edit).toBeHidden();
    await expect(page.locator('.alert--success')).toContainText(`« ${renamed} »`);
    await expect(event(page, renamed)).toHaveCount(1);
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    await expect(event(page, renamed)).toHaveCount(1);

    // Delete it: the dialog says every week goes, and it does.
    await event(page, renamed).click();
    await page.getByRole('dialog', { name: renamed }).getByRole('button', { name: 'Supprimer' }).click();
    const remove = page.getByRole('dialog', { name: 'Supprimer l’événement ?' });
    await expect(remove).toContainText('pour toutes les semaines');
    await axeAtBothWidths(page);
    await remove.getByRole('button', { name: 'Supprimer' }).click();
    await expect(remove).toBeHidden();
    await expect(page.locator('.alert--success')).toContainText(`« ${renamed} » est supprimé de l’agenda.`);
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeFocused();
    await expect(event(page, renamed)).toHaveCount(0);
    await page.getByRole('button', { name: 'Semaine précédente' }).click();
    await expect(event(page, renamed)).toHaveCount(0);
    expect(weeksAhead(day!)).toBeGreaterThan(0);
  } finally {
    const left = (await (await request.get(`/api/events?from=${day}&to=${addDays(day!, 14)}`, { headers: teacher })).json()) as EventDto[];
    for (const e of left.filter((x) => x.title.startsWith(title))) await request.delete(`/api/events/${e.id}`, { headers: teacher });
  }
});
