import { addDays, daysBetween, weekday, weekDays } from '@cdls/shared';
import { schoolToday } from './school';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { firstTeachingWeek } from './school-weeks';
import { axeAtBothWidths, goInApp, signInAs, tokenOf } from './structure';

/**
 * Two leftovers of the planner's page: « Professeur absent » never proposes (or accepts) the same teacher for
 * two lessons at the same time, and a late 409 refreshes the lists with a clear message instead of a dead end;
 * a moved lesson is a real session on the day it moved to only, its old day keeps a struck-through trace.
 * Widths are set inside the tests, so the phone project skips.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at 390 and 1440 px inside each test');
});

interface Free {
  teacherId: string;
  name: string;
  sameSubject: boolean;
}
interface Lesson {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  classLabel: string;
  groupLabel: string | null;
  subjectName: string;
  roomId: string | null;
  roomName: string | null;
  currentKind: string | null;
  freeTeachers: Free[];
}

const mona: Free = { teacherId: 'mona', name: 'Mona Maths', sameSubject: true };
const omar: Free = { teacherId: 'omar', name: 'Omar Autre', sameSubject: false };

const lesson = (over: Partial<Lesson>): Lesson => ({
  slotId: 'a',
  date: addDays(schoolToday(), 30),
  startTime: '08:00',
  endTime: '09:00',
  classLabel: '1ère A',
  groupLabel: null,
  subjectName: 'Mathématiques',
  roomId: null,
  roomName: null,
  currentKind: null,
  freeTeachers: [omar, mona],
  ...over,
});

async function pickTeacher(page: Page, name: string, from: string, to: string): Promise<void> {
  await page.getByLabel('Enseignant absent').selectOption({ label: name });
  await page.getByLabel('Premier jour').fill(from);
  await page.getByLabel('Dernier jour').fill(to);
  await page.getByRole('button', { name: 'Voir les séances' }).click();
}

async function teacherOf(
  request: APIRequestContext,
): Promise<{ name: string; id: string; auth: { Authorization: string } }> {
  const auth = await tokenOf(request, ACCOUNTS.teacher);
  const me = (await (await request.get('/api/auth/me', { headers: auth })).json()) as {
    teacherId: string;
    firstName: string;
    lastName: string;
  };
  return { name: `${me.firstName} ${me.lastName}`, id: me.teacherId, auth };
}

/** Puts every session of a teacher back to the weekly rule, through the API. */
async function restore(
  request: APIRequestContext,
  teacherId: string,
  from: string,
  to: string,
): Promise<void> {
  const admin = await tokenOf(request, ACCOUNTS.admin);
  const sessions = (await (
    await request.get(`/api/timetable/occurrences?teacherId=${teacherId}&from=${from}&to=${to}`, {
      headers: admin,
    })
  ).json()) as { exceptionId: string | null }[];
  for (const s of sessions)
    if (s.exceptionId)
      await request.delete(`/api/timetable/exceptions/${s.exceptionId}`, { headers: admin });
}

test('two lessons at the same time never get the same covering teacher', async ({ page, request }) => {
  const { name } = await teacherOf(request);
  const date = addDays(schoolToday(), 30);
  // Two lessons that overlap (08:00 to 09:00 and 08:30 to 09:30), one teacher of the subject free for both.
  const preview = {
    teacherId: 't',
    teacherName: name,
    from: date,
    to: date,
    sessions: [
      lesson({ slotId: 'a', date, startTime: '08:00', endTime: '09:00' }),
      lesson({ slotId: 'b', date, startTime: '08:30', endTime: '09:30', classLabel: '1ère B' }),
      lesson({ slotId: 'c', date, startTime: '09:30', endTime: '10:30', classLabel: '1ère C' }),
    ],
  };
  await signInAs(page, ACCOUNTS.planner);
  await goInApp(page, '/admin/planification/professeur-absent');
  await page.route('**/api/planner/absence?*', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(preview) })
      : route.continue(),
  );
  await pickTeacher(page, name, date, date);
  const lessons = page.locator('fieldset.absence__lesson');
  await expect(lessons).toHaveCount(3);

  await lessons.nth(0).getByRole('radio', { name: 'Remplacer' }).check();
  await lessons.nth(1).getByRole('radio', { name: 'Remplacer' }).check();
  await lessons.nth(2).getByRole('radio', { name: 'Remplacer' }).check();
  const cover = (i: number) => lessons.nth(i).getByLabel('Enseignant qui remplace');
  // The first gets the teacher of the subject; the second (same time) is not offered them, nor proposed anybody;
  // the third starts when the first ends, so the same teacher is proposed again.
  await expect(cover(0)).toHaveValue('mona');
  await expect(cover(1)).toHaveValue('');
  await expect(cover(1).locator('option[value="mona"]')).toHaveCount(0);
  await expect(cover(1).locator('option[value="omar"]')).toHaveCount(1);
  await expect(cover(2)).toHaveValue('mona');
  await expect(
    lessons.nth(1).getByText('Aucun enseignant de la matière n’est libre'),
  ).toBeVisible();
  await axeAtBothWidths(page);

  // Giving the first one to somebody else frees the teacher for the second one.
  await cover(0).selectOption('omar');
  await expect(cover(1).locator('option[value="mona"]')).toHaveCount(1);
  await expect(cover(0).locator('option[value="omar"]')).toHaveCount(1);
  await cover(1).selectOption('mona');
  await expect(cover(0).locator('option[value="mona"]')).toHaveCount(0);
});

test('a late 409 refreshes the lists, says who is no longer free and proposes somebody else', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const { name, id, auth } = await teacherOf(request);
  // The first school week with lessons (never a holiday, whatever the day of the run).
  const from = await firstTeachingWeek(request, auth, `teacherId=${id}`);
  const to = addDays(from, 6);
  const admin = await tokenOf(request, ACCOUNTS.admin);
  const touched: string[] = [id];
  try {
    await signInAs(page, ACCOUNTS.planner);
    await goInApp(page, '/admin/planification/professeur-absent');
    await pickTeacher(page, name, from, to);
    const lessons = page.locator('fieldset.absence__lesson');
    await expect(lessons.first()).toBeVisible();
    const count = await lessons.count();
    for (let i = 0; i < count; i++)
      await lessons.nth(i).getByRole('radio', { name: 'Annuler' }).check();

    // Lesson 0 is covered by somebody free at that moment.
    await lessons.nth(0).getByRole('radio', { name: 'Remplacer' }).check();
    const cover = lessons.nth(0).getByLabel('Enseignant qui remplace');
    await cover.selectOption({ index: 1 });
    const takenId = await cover.inputValue();
    expect(takenId).not.toBe('');
    const takenName = (await cover.locator('option:checked').innerText()).trim();

    // Meanwhile another planner gives that teacher a lesson at the same time (the preview was only advice).
    const [slotKey] = [(await lessons.nth(0).getAttribute('data-key')) ?? ''];
    const [slotId, date] = slotKey.split('@') as [string, string];
    const start = (
      (await (
        await request.get(`/api/planner/absence?teacherId=${id}&from=${date}&to=${date}`, {
          headers: admin,
        })
      ).json()) as { sessions: Lesson[] }
    ).sessions.find((s) => s.slotId === slotId)!;
    const others = (await (await request.get('/api/planner/teachers', { headers: admin })).json()) as {
      teacherId: string;
    }[];
    let blocked = false;
    for (const other of others) {
      if (other.teacherId === id || other.teacherId === takenId) continue;
      const theirs = (
        (await (
          await request.get(`/api/planner/absence?teacherId=${other.teacherId}&from=${date}&to=${date}`, {
            headers: admin,
          })
        ).json()) as { sessions: Lesson[] }
      ).sessions.find(
        (s) =>
          s.startTime < start.endTime &&
          start.startTime < s.endTime &&
          s.currentKind === null &&
          s.freeTeachers.some((f) => f.teacherId === takenId),
      );
      if (!theirs) continue;
      const res = await request.post('/api/planner/absence', {
        headers: admin,
        data: {
          teacherId: other.teacherId,
          from: date,
          to: date,
          choices: [
            { slotId: theirs.slotId, date: theirs.date, kind: 'substitute', teacherId: takenId },
          ],
        },
      });
      if (res.ok()) {
        touched.push(other.teacherId);
        blocked = true;
        break;
      }
    }
    expect(blocked, 'a lesson at the same time that the teacher can be given').toBe(true);

    await page.getByRole('button', { name: 'Enregistrer et prévenir' }).click();
    const notice = page.getByRole('alert').filter({ hasText: 'la disponibilité des enseignants a changé' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(`${takenName} n’est plus libre`);
    await expect(notice).toContainText('vos autres choix sont gardés');
    await expect(page.locator('.alert--success')).toHaveCount(0);
    // Focus lands on the message; the teacher is gone from the list and the other choices are kept.
    await expect(page.locator('#absence-refresh')).toBeFocused();
    await expect(cover.locator(`option[value="${takenId}"]`)).toHaveCount(0);
    await expect(lessons.nth(count - 1).getByRole('radio', { name: 'Annuler' })).toBeChecked();
    await axeAtBothWidths(page);

    // Choosing somebody still free saves.
    const free = await cover.locator('option').evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
    );
    if (!(await cover.inputValue())) await cover.selectOption(free[0]!);
    await page.getByRole('button', { name: 'Enregistrer et prévenir' }).click();
    await expect(page.locator('.alert--success')).toContainText('Enregistré');
    await expect(notice).toHaveCount(0);
  } finally {
    for (const teacherId of touched) await restore(request, teacherId, from, to);
  }
});

test('a moved lesson is one real session on its new day and a struck trace on its old day', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const { id, auth } = await teacherOf(request);
  const admin = await tokenOf(request, ACCOUNTS.admin);
  const from = await firstTeachingWeek(request, auth, `teacherId=${id}`);
  const to = addDays(from, 6);
  try {
    const sessions = (await (
      await request.get(`/api/timetable/occurrences?teacherId=${id}&from=${from}&to=${to}`, {
        headers: admin,
      })
    ).json()) as { slotId: string; originalDate: string; status: string }[];
    const origin = sessions.find((s) => s.status === 'normal')!;
    // The evening of a later school day of the same week, long after classes: nothing clashes (a holiday is skipped).
    let target = '';
    for (let i = 1; i <= 6 && !target; i++) {
      const candidate = addDays(origin.originalDate, i);
      if (candidate > to || weekday(candidate) > 4) continue;
      const res = await request.post(`/api/timetable/slots/${origin.slotId}/exceptions`, {
        headers: admin,
        data: {
          date: origin.originalDate,
          kind: 'moved',
          newDate: candidate,
          newStart: '21:30',
          newEnd: '22:30',
        },
      });
      if (res.ok()) target = candidate;
    }
    test.skip(!target, 'no school day to move the lesson to in that week');

    await signInAs(page, ACCOUNTS.teacher);
    await goInApp(page, '/enseignant/emploi-du-temps');
    const weeks =
      daysBetween(weekDays(schoolToday())[0]!, weekDays(origin.originalDate)[0]!) / 7;
    for (let i = 0; i < weeks; i++)
      await page.getByRole('button', { name: 'Semaine suivante' }).click();
    const column = (day: string) => page.locator(`section[aria-labelledby="jour-${day}"]`);
    await expect(column(origin.originalDate)).toBeVisible();

    // Old day: a struck trace that says where it went, with no room or teacher line of its own.
    const trace = column(origin.originalDate).locator('app-session-item.session--struck');
    await expect(trace).toHaveCount(1);
    await expect(trace).toContainText('Déplacée');
    await expect(trace).toContainText('Déplacée au');
    // New day: the real session, once, not struck, with « avant / maintenant ».
    const real = column(target).locator('app-session-item').filter({ hasText: '21 h 30' });
    await expect(real).toHaveCount(1);
    await expect(real).not.toHaveClass(/session--struck/);
    await expect(real).toContainText('Avant :');
    // Nowhere else in the week: the only other mention of the new time is the trace, which is struck.
    await expect(
      page.locator('app-session-item:not(.session--struck)').filter({ hasText: '21 h 30' }),
    ).toHaveCount(1);
    await axeAtBothWidths(page);
  } finally {
    await restore(request, id, from, to);
  }
});
