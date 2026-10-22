import { expect, test, type APIRequestContext } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { axeAtBothWidths, goInApp, signInAs, tokenOf } from './structure';

/**
 * The « Nouvelle année » wizard, end to end, on a copy: the test builds a small school year of its own through the
 * API (two Bac français classes, seconde then première, with a subject, a period and four students), rolls it over
 * in the browser, and checks the promoted classes and the read-only old year. The demo year is never touched.
 * Years get a far-future label drawn at random, so the suite can run again on the same database.
 * The phone project is skipped: every step and dialog is checked at 390 and 1440 px through Axe.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at both widths inside each test');
});

interface Created {
  readonly yearId: string;
  readonly label: string;
  readonly nextLabel: string;
  readonly secondeId: string;
  readonly premiereId: string;
  readonly names: { readonly seconde: string[]; readonly premiere: string[] };
}

async function json<T>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as T;
}

/** A school year of its own, with classes linked seconde → première (terminal), a subject, a period and students. */
async function createCopyYear(request: APIRequestContext): Promise<Created> {
  const headers = await tokenOf(request, ACCOUNTS.admin);
  const start = 2200 + Math.floor(Math.random() * 7000);
  const label = `${start}-${start + 1}`;
  const year = await json<{ id: string }>(
    await request.post('/api/school-years', { headers, data: { label, startsOn: `${start}-09-01`, endsOn: `${start + 1}-06-30` } }),
  );
  const sections = await json<{ id: string; code: string }[]>(await request.get('/api/sections', { headers }));
  const bac = sections.find((s) => s.code === 'bac')!;
  const klass = (code: string, name: string) =>
    request.post('/api/classes', { headers, data: { schoolYearId: year.id, sectionId: bac.id, code, label: name } });
  const seconde = await json<{ id: string }>(await klass('seconde', 'Seconde'));
  const premiere = await json<{ id: string }>(await klass('premiere', 'Première'));
  await json(await request.patch(`/api/classes/${seconde.id}`, { headers, data: { nextClassId: premiere.id } }));
  for (const c of [seconde, premiere])
    await json(await request.post(`/api/classes/${c.id}/subjects`, { headers, data: { subjectId: 'mathematiques', coefficient: 3 } }));
  await json(
    await request.post(`/api/school-years/${year.id}/periods`, {
      headers,
      data: { number: 1, label: '1er trimestre', startsOn: `${start}-09-01`, endsOn: `${start}-12-15` },
    }),
  );
  const tag = Array.from({ length: 5 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  const names = { seconde: [] as string[], premiere: [] as string[] };
  for (const [key, classId] of [['seconde', seconde.id], ['premiere', premiere.id]] as const)
    for (let i = 1; i <= 2; i++) {
      const firstName = `Roll${tag}${key === 'seconde' ? 'S' : 'P'}${i}`;
      await json(await request.post('/api/users', { headers, data: { role: 'student', firstName, lastName: 'Playwright', classId } }));
      names[key].push(`${firstName} Playwright`);
    }
  return { yearId: year.id, label, nextLabel: `${start + 1}-${start + 2}`, secondeId: seconde.id, premiereId: premiere.id, names };
}

test('runs the wizard on a copy year, promotes the students and leaves the old year read-only', async ({ page, request }) => {
  test.setTimeout(180_000);
  const copy = await createCopyYear(request);
  const [secondeA, secondeB] = copy.names.seconde;
  const [premiereA, premiereB] = copy.names.premiere;

  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/nouvelle-annee');
  await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle année' })).toBeVisible();
  const stepHeading = (name: string) => page.getByRole('heading', { level: 2, name, exact: true });

  // Step 1: the source year and the proposed dates.
  await expect(stepHeading('Année et dates')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Étapes de la nouvelle année' }).getByRole('listitem').first()).toHaveAttribute('aria-current', 'step');
  await page.getByLabel('Année à copier').selectOption(copy.yearId);
  await expect(page.getByLabel('Nom de la nouvelle année')).toHaveValue(copy.nextLabel);
  const start = Number(copy.label.slice(0, 4)) + 1;
  await expect(page.getByLabel('Rentrée')).toHaveValue(`${start}-09-01`);
  await expect(page.getByLabel('Fin de l’année')).toHaveValue(`${start + 1}-06-30`);
  await axeAtBothWidths(page);
  // An invalid name stops the step and says how to fix it.
  await page.getByLabel('Nom de la nouvelle année').fill('2030');
  await page.getByRole('button', { name: 'Choisir ce qui est copié' }).click();
  await expect(page.getByText('Écrivez le nom de la nouvelle année avec deux années qui se suivent').first()).toBeVisible();
  await page.getByLabel('Nom de la nouvelle année').fill(copy.nextLabel);

  // Step 2: what is copied. The timetable needs the assignments.
  await page.getByRole('button', { name: 'Choisir ce qui est copié' }).click();
  await expect(stepHeading('Ce qui est copié')).toBeFocused();
  const assignments = page.getByLabel('Copier les affectations des enseignants');
  const timetable = page.getByLabel('Copier l’emploi du temps');
  await expect(timetable).toBeEnabled();
  await assignments.uncheck();
  await expect(timetable).toBeDisabled();
  await assignments.check();
  await expect(timetable).toBeEnabled();
  await axeAtBothWidths(page);

  // Step 3: the preview. Nothing is written yet.
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await expect(stepHeading('Aperçu et élèves')).toBeVisible();
  await expect(stepHeading('Aperçu et élèves')).toBeFocused();
  await expect(page.getByRole('table', { name: /Classes de l’année source/ })).toContainText('Classe terminale : diplôme');
  const students = page.getByRole('table', { name: /Élèves de l’année/ });
  await expect(students.getByRole('row')).toHaveCount(5);
  await expect(page.getByLabel(`Décision pour ${premiereA}`)).toHaveValue('graduate');
  await expect(page.getByLabel(`Décision pour ${secondeA}`)).toHaveValue('promote');
  const earlier = await json<{ label: string }[]>(await request.get('/api/school-years', { headers: await tokenOf(request, ACCOUNTS.admin) }));
  expect(earlier.some((y) => y.label === copy.nextLabel)).toBe(false);

  // The secretariat's decisions: a redoublement, a départ, then « Tous promus » resets them.
  await page.getByLabel(`Décision pour ${secondeA}`).selectOption('repeat');
  await page.getByLabel(`Décision pour ${premiereA}`).selectOption('leave');
  await expect(page.getByText('Vos décisions ont changé depuis le dernier aperçu.')).toBeVisible();
  await page.getByRole('button', { name: 'Tous promus' }).click();
  await expect(page.getByLabel(`Décision pour ${secondeA}`)).toHaveValue('promote');
  await expect(page.getByLabel(`Décision pour ${premiereA}`)).toHaveValue('graduate');
  await expect(page.getByText('Vos décisions ont changé depuis le dernier aperçu.')).toBeHidden();
  // Search and filters.
  await page.getByLabel('Rechercher un élève').fill(secondeB.toLowerCase());
  await expect(students.getByRole('row')).toHaveCount(2);
  await page.getByLabel('Rechercher un élève').fill('');
  await page.getByLabel('Classe actuelle', { exact: true }).selectOption({ label: 'Première (Bac français)' });
  await expect(students.getByRole('row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  // Bulk: every student shown is marked « Redoublement », then reset.
  await page.getByLabel('Classe actuelle', { exact: true }).selectOption({ label: 'Seconde (Bac français)' });
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.getByLabel(`Décision pour ${secondeA}`)).toHaveValue('repeat');
  await expect(page.getByLabel(`Décision pour ${secondeB}`)).toHaveValue('repeat');
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await page.getByRole('button', { name: 'Tous promus' }).click();
  // The real choices: the first seconde repeats, the second première student leaves.
  await page.getByLabel(`Décision pour ${secondeA}`).selectOption('repeat');
  await page.getByLabel(`Décision pour ${premiereB}`).selectOption('leave');
  await axeAtBothWidths(page);

  // The draft survives a reload: the wizard reopens at the preview, recomputed, with the choices kept.
  await page.reload();
  await page.locator('.app-bar').waitFor();
  await expect(stepHeading('Aperçu et élèves')).toBeVisible();
  await expect(page.getByLabel(`Décision pour ${secondeA}`)).toHaveValue('repeat');
  await expect(page.getByLabel(`Décision pour ${premiereB}`)).toHaveValue('leave');

  // The stepper by keyboard: a finished step is a button; Enter goes back, the step heading takes focus.
  const first = page.getByRole('button', { name: /Année et dates/ });
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(stepHeading('Année et dates')).toBeFocused();
  await expect(page.getByLabel('Nom de la nouvelle année')).toHaveValue(copy.nextLabel);
  // Forward to the review again with the keyboard alone.
  const next = page.getByRole('button', { name: 'Choisir ce qui est copié' });
  await next.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).focus();
  await page.keyboard.press('Enter');
  await expect(stepHeading('Aperçu et élèves')).toBeFocused();
  await expect(page.getByLabel(`Décision pour ${secondeA}`)).toHaveValue('repeat');

  // Step 4: the confirmation, and the dialog that restates the consequences.
  await page.getByRole('button', { name: 'Passer à la confirmation' }).click();
  await expect(stepHeading('Confirmation')).toBeVisible();
  await expect(page.getByText(`archivée`).first()).toBeVisible();
  await axeAtBothWidths(page);
  const launch = page.getByRole('button', { name: `Lancer le passage à ${copy.nextLabel}` });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: 'Lancer le passage à la nouvelle année ?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`L’année ${copy.label} est archivée`);
  await expect(dialog).toContainText('1 élève redouble');
  await expect(dialog).toContainText('1 élève est diplômé');
  await expect(dialog).toContainText('1 élève quitte le collège');
  await axeAtBothWidths(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launch).toBeFocused();
  await launch.click();
  await dialog.getByRole('button', { name: 'Lancer le passage' }).click();

  // Step 5: the result, with a link to each class created.
  await expect(stepHeading('Résultat')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`L’année ${copy.nextLabel} est prête.`)).toBeVisible();
  await expect(page.getByRole('link', { name: /^Seconde/ })).toBeVisible();
  await axeAtBothWidths(page);

  // The promoted classes.
  const headers = await tokenOf(request, ACCOUNTS.admin);
  const years = await json<{ id: string; label: string; status: string }[]>(await request.get('/api/school-years', { headers }));
  const created = years.find((y) => y.label === copy.nextLabel)!;
  const old = years.find((y) => y.label === copy.label)!;
  expect(old.status).toBe('archived');
  const nextClasses = await json<{ id: string; code: string }[]>(await request.get(`/api/classes?schoolYearId=${created.id}`, { headers }));
  const rosterOf = async (code: string) => {
    const id = nextClasses.find((c) => c.code === code)!.id;
    const roster = await json<{ firstName: string }[]>(await request.get(`/api/classes/${id}/students`, { headers }));
    return roster.map((s) => s.firstName).sort();
  };
  // Seconde: the repeater; première: the promoted seconde student; the first première student graduated, the second left.
  expect(await rosterOf('seconde')).toEqual([secondeA!.split(' ')[0]]);
  expect(await rosterOf('premiere')).toEqual([secondeB!.split(' ')[0]]);

  // The link opens the new class.
  await page.getByRole('link', { name: /^Première/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Première' })).toBeVisible();
  await expect(page.getByText(secondeB!, { exact: true })).toBeVisible();
  await expect(page.getByText('Année archivée')).toBeHidden();

  // The old year is read-only: the banner on its screens, and the API refuses writes with a French message.
  await goInApp(page, `/admin/classes/${copy.secondeId}`);
  await expect(page.getByText('Année archivée').first()).toBeVisible();
  await axeAtBothWidths(page);
  await goInApp(page, '/admin/annees');
  await page.getByLabel('Année affichée').selectOption(copy.yearId);
  await expect(page.getByText('Année archivée').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Définir comme année en cours' })).toHaveCount(0);
  await axeAtBothWidths(page);

  const refused = await request.patch(`/api/classes/${copy.secondeId}`, { headers, data: { nextClassId: null } });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toMatchObject({ code: 'YEAR_ARCHIVED' });
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const cours = (await json<{ id: string; code: string }[]>(await request.get('/api/activity-types', { headers: teacher }))).find((t) => t.code === 'controle')!;
  const event = await request.post('/api/events', {
    headers: teacher,
    data: { activityTypeId: cours.id, title: 'Contrôle', subjectId: 'mathematiques', classId: copy.premiereId, date: `${start - 1}-10-06` },
  });
  expect(event.status()).toBe(409);
  expect(String(((await event.json()) as { message: string }).message)).toMatch(/archivée/);
});

test('is for the admin alone: a coordinator is sent back to the structure screens', async ({ page }) => {
  await signInAs(page, ACCOUNTS.coordinator);
  await goInApp(page, '/admin/nouvelle-annee');
  await expect(page).not.toHaveURL(/nouvelle-annee/);
  await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle année' })).toHaveCount(0);
});
