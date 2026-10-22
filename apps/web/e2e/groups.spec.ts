import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Browser, type Locator, type Page, test } from '@playwright/test';
import { ACCOUNTS, type Account } from './accounts';

/**
 * Groups and « Assigner à »: a teacher creates groups, puts students in them, assigns a homework to one group,
 * grades and rolls only the students it concerns; a student sees only their own work. Axe at 390 and 1440 px
 * on every new screen and dialog, and the keyboard on every new interaction.
 */

const CLASS_LABEL = '2e secondaire';
const DIVISION = 'E2E TP';
const GROUP_A = 'E2E Groupe A';
const GROUP_B = 'E2E Groupe B';
const TITLE_PREFIX = 'E2E ';
/** A Friday of the third trimester: no lesson of the demo timetable, so a timed event does not clash. */
const FRIDAY = '2027-04-16';

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** The two demo students of the class (the credentials file lists two per class). */
function demoStudents(): { account: Account; name: string }[] {
  const text = readFileSync(resolve(__dirname, '../../api/demo-credentials.local.md'), 'utf8');
  const out: { account: Account; name: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^- (\S+)@(\S+) \(Bac nationale — 2e secondaire\)/);
    if (!m) continue;
    const local = m[1]!;
    const name = local
      .replace(/\d+$/, '')
      .split('.')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    out.push({ account: { email: `${local}@${m[2]}`, password: ACCOUNTS.student.password }, name });
  }
  return out;
}
const [S1, S2] = demoStudents() as [ReturnType<typeof demoStudents>[number], ReturnType<typeof demoStudents>[number]];

/** Chooses the option of a select by the text it contains (a title with a date in front of it, say). */
async function pick(select: Locator, text: string): Promise<void> {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value!);
}

async function signInTo(page: Page, account: Account, path: string): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'));
  await page.locator('.app-bar').waitFor();
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}

/** Another person in another browser context (the access token lives in memory, so contexts do not mix). */
async function asPerson(browser: Browser, baseURL: string, account: Account, path: string) {
  const context = await browser.newContext({ baseURL, locale: 'fr-FR' });
  const page = await context.newPage();
  await signInTo(page, account, path);
  return { page, close: () => context.close() };
}

async function expectNoAxeViolations(page: Page, where: string): Promise<void> {
  // Buttons fade between their disabled and enabled looks: measure the colours once they have settled.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    `Axe on ${where}`,
  ).toEqual([]);
}

/** Admin API session to prepare and clean up (the token never leaves this process). */
async function adminApi(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: ACCOUNTS.admin });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    get: async <T>(url: string) => (await (await request.get(url, { headers })).json()) as T,
    post: async <T>(url: string, data: object) => {
      const res = await request.post(url, { headers, data });
      if (!res.ok()) throw new Error(`${url}: ${res.status()} ${await res.text()}`);
      return (await res.json()) as T;
    },
    put: (url: string, data: object) => request.put(url, { headers, data }),
    del: (url: string) => request.delete(url, { headers }),
  };
}

interface Ids {
  classId: string;
  s1: string;
  s2: string;
  mathsTypeExam: string;
}

async function ids(request: APIRequestContext): Promise<Ids> {
  const api = await adminApi(request);
  const classes = await api.get<{ id: string; label: string }[]>('/api/classes');
  const classId = classes.find((c) => c.label === CLASS_LABEL)!.id;
  const student = async (email: string) =>
    (await api.get<{ items: { studentId: string }[] }>(`/api/users?role=student&search=${encodeURIComponent(email)}`)).items[0]!.studentId;
  const types = await api.get<{ id: string; code: string }[]>('/api/activity-types');
  return {
    classId,
    s1: await student(S1.account.email),
    s2: await student(S2.account.email),
    mathsTypeExam: types.find((t) => t.code === 'examen')!.id,
  };
}

/** Removes the groups and the events the tests made (everything starts with « E2E »). */
async function cleanUp(request: APIRequestContext): Promise<void> {
  const api = await adminApi(request);
  const { classId } = await ids(request);
  const events = await api.get<{ id: string; title: string }[]>(`/api/events?classId=${classId}&from=${iso(-170)}&to=${iso(15)}`);
  const later = await api.get<{ id: string; title: string }[]>(`/api/events?classId=${classId}&from=${FRIDAY}&to=${FRIDAY}`);
  for (const e of [...events, ...later].filter((x) => x.title.startsWith(TITLE_PREFIX))) {
    // An evaluation with marks cannot be deleted: take the marks off first.
    const sheet = await api.get<{ rows: { student: { id: string }; grade: unknown }[] }>(`/api/events/${e.id}/grades`);
    const graded = (sheet.rows ?? []).filter((r) => r.grade).map((r) => ({ studentId: r.student.id, score: null }));
    if (graded.length) await api.put(`/api/events/${e.id}/grades`, { entries: graded });
    await api.del(`/api/events/${e.id}`);
  }
  const groups = await api.get<{ id: string; division: string }[]>(`/api/groups?classId=${classId}`);
  for (const g of groups.filter((x) => x.division === DIVISION)) await api.del(`/api/groups/${g.id}`);
}

/** Two groups with one student each, made through the API. */
async function setUpGroups(request: APIRequestContext): Promise<{ a: string; b: string } & Ids> {
  const api = await adminApi(request);
  const base = await ids(request);
  const make = async (label: string, studentId: string) => {
    const g = await api.post<{ id: string }>('/api/groups', { classId: base.classId, division: DIVISION, label });
    await api.post(`/api/groups/${g.id}/members`, { studentIds: [studentId] });
    return g.id;
  };
  return { ...base, a: await make(GROUP_A, base.s1), b: await make(GROUP_B, base.s2) };
}

/** Teacher token, for creating events the way the form does. */
async function teacherApi(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: ACCOUNTS.teacher });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    post: async <T>(url: string, data: object) => {
      const res = await request.post(url, { headers, data });
      if (!res.ok()) throw new Error(`${url}: ${res.status()} ${await res.text()}`);
      return (await res.json()) as T;
    },
  };
}

test.describe('groups and « Assigner à »', () => {
  test.beforeEach(async ({ request }) => {
    await cleanUp(request);
  });
  test.afterEach(async ({ request }) => {
    await cleanUp(request);
  });

  test('a teacher creates two groups, fills them, and the one-group-per-division rule is explained', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'The long flow runs on desktop; the phone is covered by the Axe test below.');
    await signInTo(page, ACCOUNTS.teacher, '/enseignant/groupes');
    await expect(page.getByRole('heading', { level: 1, name: 'Groupes' })).toBeVisible();
    await page.getByLabel('Classe', { exact: true }).selectOption({ label: CLASS_LABEL });

    const create = async (label: string) => {
      await page.getByRole('button', { name: 'Nouveau groupe' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Nouveau groupe' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Division').fill(DIVISION);
      await dialog.getByLabel('Nom du groupe').fill(label);
      await dialog.getByRole('button', { name: 'Créer le groupe' }).click();
      await expect(page.locator('.alert--success').filter({ hasText: `Groupe « ${label} » créé` })).toBeVisible();
    };
    await create(GROUP_A);
    await create(GROUP_B);
    await expect(page.getByRole('heading', { level: 2, name: `Division « ${DIVISION} »` })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(GROUP_A) })).toBeVisible();

    const openMembers = async (label: string) => {
      await page.getByRole('button', { name: `Gérer les élèves de ${label}` }).click();
      const dialog = page.getByRole('dialog', { name: `Élèves du groupe ${label}` });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    // The first student joins A, with the keyboard-reachable checkbox and button.
    let dialog = await openMembers(GROUP_A);
    await dialog.getByLabel(S1.name).check();
    await dialog.getByRole('button', { name: /Ajouter au groupe/ }).click();
    await expect(dialog.getByRole('status').filter({ hasText: '1 élève ajouté' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Terminé' }).click();

    // In B, the same student is refused: the answer says where they are and states the rule.
    dialog = await openMembers(GROUP_B);
    await expect(dialog.getByText(`déjà dans « ${GROUP_A} »`)).toBeVisible();
    await dialog.getByLabel(S1.name).check();
    await dialog.getByRole('button', { name: /Ajouter au groupe/ }).click();
    const refusal = dialog.getByRole('alert');
    await expect(refusal).toContainText(GROUP_A);
    await expect(refusal).toContainText('un groupe par division');
    // Asking to move them works.
    await dialog.getByLabel(/Déplacer ceux qui sont déjà dans un autre groupe/).check();
    await dialog.getByRole('button', { name: /Ajouter au groupe/ }).click();
    await expect(dialog.getByRole('status').filter({ hasText: '1 élève ajouté' })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /Dans ce groupe \(1\)/ })).toContainText(S1.name);
    await dialog.getByRole('button', { name: 'Terminé' }).click();

    // The second student goes to A; then they can be taken out again.
    dialog = await openMembers(GROUP_A);
    await dialog.getByLabel(S2.name).check();
    await dialog.getByRole('button', { name: /Ajouter au groupe/ }).click();
    await expect(dialog.getByRole('group', { name: /Dans ce groupe \(1\)/ })).toContainText(S2.name);
    await dialog.getByLabel(S2.name).check();
    await dialog.getByRole('button', { name: /Retirer du groupe/ }).click();
    await expect(dialog.getByRole('status').filter({ hasText: '1 élève retiré' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('homework assigned to one group is seen only by the students of that group', async ({ page, browser, request }, info) => {
    test.skip(info.project.name === 'phone', 'The long flow runs on desktop.');
    await setUpGroups(request);
    const baseURL = String(info.project.use.baseURL ?? 'http://localhost:4200');
    await signInTo(page, ACCOUNTS.teacher, '/enseignant/agenda');
    await page.getByRole('button', { name: 'Nouvel événement' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouvel événement' });
    await dialog.getByLabel('Type').selectOption({ label: 'Devoir à rendre' });
    await dialog.getByLabel('Titre').fill(`${TITLE_PREFIX}devoir du groupe A`);
    await dialog.getByLabel('Classe et matière').selectOption({ label: `${CLASS_LABEL}, Mathématiques` });
    await dialog.getByLabel('Date').fill(iso(3));
    // « Assigner à »: the whole class by default, then groups, with the number of students.
    const picker = dialog.getByRole('group', { name: 'Assigner à' });
    await expect(picker).toContainText('Toute la classe');
    await expect(picker.getByRole('status')).toContainText('élèves concernés');
    await picker.getByLabel('Des groupes ou des élèves').check();
    await expect(picker.getByRole('status')).toContainText('Choisissez au moins un groupe');
    await picker.getByLabel(new RegExp(GROUP_A)).check();
    await expect(picker.getByRole('status')).toHaveText(new RegExp(`${GROUP_A} : 1 élève concerné`));
    await dialog.getByRole('button', { name: 'Créer l’événement' }).click();
    await expect(page.locator('.alert--success').filter({ hasText: 'est enregistré dans l’agenda' })).toBeVisible();

    const inA = await asPerson(browser, baseURL, S1.account, '/eleve/devoirs');
    await expect(inA.page.getByText(`${TITLE_PREFIX}devoir du groupe A`)).toBeVisible();
    await expect(inA.page.getByText(`groupe ${GROUP_A}`)).toBeVisible();
    await inA.close();
    const inB = await asPerson(browser, baseURL, S2.account, '/eleve/devoirs');
    await expect(inB.page.getByRole('heading', { level: 1, name: 'Devoirs' })).toBeVisible();
    await expect(inB.page.getByText(`${TITLE_PREFIX}devoir du groupe A`)).toHaveCount(0);
    await inB.close();
  });

  test('the grade grid lists and saves only the students the evaluation concerns', async ({ page, request }, info) => {
    test.skip(info.project.name === 'phone', 'The long flow runs on desktop.');
    const setup = await setUpGroups(request);
    const teacher = await teacherApi(request);
    const title = `${TITLE_PREFIX}contrôle du groupe A`;
    await teacher.post('/api/events', {
      activityTypeId: setup.mathsTypeExam,
      title,
      subjectId: 'mathematiques',
      classId: setup.classId,
      date: iso(0),
      target: { groupIds: [setup.a], studentIds: [] },
    });
    await signInTo(page, ACCOUNTS.teacher, '/enseignant/notes');
    await page.getByLabel('Classe', { exact: true }).selectOption({ label: CLASS_LABEL });
    await pick(page.getByLabel('Évaluation', { exact: true }), title);
    await expect(page.locator('p', { hasText: 'Assignée à :' })).toContainText(GROUP_A);
    const grid = page.getByRole('table');
    await expect(grid.getByRole('rowheader', { name: new RegExp(S1.name) })).toBeVisible();
    await expect(grid.getByRole('rowheader', { name: new RegExp(S2.name) })).toHaveCount(0);
    await page.getByLabel(new RegExp(`${title}, ${S1.name}`)).fill('15,5');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Enregistré à/ })).toBeVisible();
  });

  test('the roll call of a group session lists only that group', async ({ page, request }, info) => {
    test.skip(info.project.name === 'phone', 'The long flow runs on desktop.');
    const setup = await setUpGroups(request);
    const teacher = await teacherApi(request);
    const title = `${TITLE_PREFIX}séance du groupe B`;
    await teacher.post('/api/events', {
      activityTypeId: setup.mathsTypeExam,
      title,
      subjectId: 'mathematiques',
      classId: setup.classId,
      date: FRIDAY,
      startTime: '09:00',
      endTime: '10:00',
      target: { groupIds: [setup.b], studentIds: [] },
    });
    await signInTo(page, ACCOUNTS.teacher, '/enseignant/appel');
    await page.getByLabel('Classe', { exact: true }).selectOption({ label: CLASS_LABEL });
    await page.getByLabel('Jour').fill(FRIDAY);
    await expect(page.getByLabel('Séance')).toBeVisible();
    await expect(page.getByLabel('Séance')).toContainText(GROUP_B);
    await expect(page.locator('p', { hasText: 'Séance pour :' })).toContainText(GROUP_B);
    const roll = page.getByRole('list').filter({ hasText: S2.name });
    await expect(roll).toBeVisible();
    await expect(page.getByText(S1.name)).toHaveCount(0);
    await page.getByRole('radio', { name: 'Absent' }).first().check();
    await page.getByRole('button', { name: 'Enregistrer l’appel' }).click();
    await expect(page.locator('.alert--success')).toContainText('Appel enregistré : 0 présent, 1 absent');
  });

  for (const width of [390, 1440]) {
    test(`Axe finds nothing on the new screens and dialogs at ${width} px, and the keyboard reaches them`, async ({ page, request, browser }, info) => {
      test.skip(info.project.name === 'phone' && width === 1440, 'One viewport per project is enough: the test sets its own width.');
      const setup = await setUpGroups(request);
      const teacher = await teacherApi(request);
      const evTitle = `${TITLE_PREFIX}axe contrôle`;
      await teacher.post('/api/events', {
        activityTypeId: setup.mathsTypeExam,
        title: evTitle,
        subjectId: 'mathematiques',
        classId: setup.classId,
        date: iso(0),
        target: { groupIds: [setup.a], studentIds: [] },
      });
      await teacher.post('/api/events', {
        activityTypeId: setup.mathsTypeExam,
        title: `${TITLE_PREFIX}axe séance`,
        subjectId: 'mathematiques',
        classId: setup.classId,
        date: FRIDAY,
        startTime: '09:00',
        endTime: '10:00',
        target: { groupIds: [setup.a], studentIds: [] },
      });
      await page.setViewportSize({ width, height: 900 });
      await signInTo(page, ACCOUNTS.teacher, '/enseignant/groupes');
      await page.getByLabel('Classe', { exact: true }).selectOption({ label: CLASS_LABEL });
      await expect(page.getByRole('heading', { level: 2, name: `Division « ${DIVISION} »` })).toBeVisible();
      await expectNoAxeViolations(page, `Groupes (${width})`);

      // « Nouveau groupe »: opened and closed with the keyboard, focus back on its button.
      const newGroup = page.getByRole('button', { name: 'Nouveau groupe' }).first();
      await newGroup.focus();
      await page.keyboard.press('Enter');
      const form = page.getByRole('dialog', { name: 'Nouveau groupe' });
      await expect(form).toBeVisible();
      await expectNoAxeViolations(page, `dialogue Nouveau groupe (${width})`);
      await page.keyboard.press('Escape');
      await expect(form).toBeHidden();
      await expect(newGroup).toBeFocused();

      // The members dialog: two lists with checkboxes.
      await page.getByRole('button', { name: `Gérer les élèves de ${GROUP_A}` }).click();
      const members = page.getByRole('dialog', { name: `Élèves du groupe ${GROUP_A}` });
      await expect(members).toBeVisible();
      await members.getByLabel(S2.name).focus();
      await page.keyboard.press('Space');
      await expect(members.getByLabel(S2.name)).toBeChecked();
      await expectNoAxeViolations(page, `dialogue Élèves du groupe (${width})`);
      await page.keyboard.press('Escape');

      // « Assigner à » in the event form: radios, checkboxes, search and chips, by keyboard.
      await page.evaluate(() => {
        history.pushState(null, '', '/enseignant/agenda');
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.getByRole('button', { name: 'Nouvel événement' }).click();
      const event = page.getByRole('dialog', { name: 'Nouvel événement' });
      await event.getByLabel('Type').selectOption({ label: 'Devoir à rendre' });
      await event.getByLabel('Classe et matière').selectOption({ label: `${CLASS_LABEL}, Mathématiques` });
      const picker = event.getByRole('group', { name: 'Assigner à' });
      await picker.getByLabel('Toute la classe').focus();
      await page.keyboard.press('ArrowDown');
      await expect(picker.getByLabel('Des groupes ou des élèves')).toBeChecked();
      await picker.getByLabel(new RegExp(GROUP_B)).focus();
      await page.keyboard.press('Space');
      await picker.getByLabel('Ajouter un élève').fill(S1.name.split(' ')[0]!);
      await picker.getByRole('button', { name: `Ajouter ${S1.name}` }).focus();
      await page.keyboard.press('Enter');
      await expect(picker.getByRole('list', { name: 'Élèves nommés' })).toContainText(S1.name);
      await expect(picker.getByRole('status').last()).toHaveText(new RegExp('2 élèves concernés'));
      await expectNoAxeViolations(page, `formulaire Assigner à (${width})`);
      await picker.getByRole('button', { name: `Retirer ${S1.name}` }).click();
      await expect(picker.getByRole('list', { name: 'Élèves nommés' })).toHaveCount(0);
      await page.keyboard.press('Escape');

      // The grade grid and the roll call, targeted.
      await page.evaluate(() => {
        history.pushState(null, '', '/enseignant/notes');
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.getByLabel('Classe', { exact: true }).selectOption({ label: CLASS_LABEL });
      await pick(page.getByLabel('Évaluation', { exact: true }), evTitle);
      await expect(page.locator('p', { hasText: 'Assignée à :' })).toBeVisible();
      await expectNoAxeViolations(page, `Saisie des notes assignée (${width})`);

      await page.evaluate(() => {
        history.pushState(null, '', '/enseignant/appel');
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.getByLabel('Classe', { exact: true }).selectOption({ label: CLASS_LABEL });
      await page.getByLabel('Jour').fill(FRIDAY);
      await expect(page.locator('p', { hasText: 'Séance pour :' })).toBeVisible();
      await expectNoAxeViolations(page, `Appel assigné (${width})`);

      // The student's timetable says which groups they are in.
      const baseURL = String(info.project.use.baseURL ?? 'http://localhost:4200');
      const student = await asPerson(browser, baseURL, S1.account, '/eleve/emploi-du-temps');
      await student.page.setViewportSize({ width, height: 900 });
      await expect(student.page.getByText(`Vos groupes : ${GROUP_A}`)).toBeVisible();
      await expectNoAxeViolations(student.page, `Emploi du temps de l’élève (${width})`);
      await student.close();

      // The administration reaches the same screen.
      const admin = await asPerson(browser, baseURL, ACCOUNTS.admin, '/admin/groupes');
      await admin.page.setViewportSize({ width, height: 900 });
      await pick(admin.page.getByLabel('Classe', { exact: true }), CLASS_LABEL);
      await expect(admin.page.getByRole('heading', { level: 2, name: `Division « ${DIVISION} »` })).toBeVisible();
      await expectNoAxeViolations(admin.page, `Groupes, administration (${width})`);
      await admin.close();
    });
  }
});
