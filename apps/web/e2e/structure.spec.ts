import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './accounts';
import { axeAtBothWidths, goInApp, signInAs, tokenOf, unique } from './structure';

/**
 * Phase 1 admin screens: subjects, class subjects, rooms, activity types, school year, coordinators.
 * Data is created with unique names and cleaned up, so the suite can run on the same database again.
 * The phone project is skipped: every check already runs at 390 and 1440 px through Axe.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at both widths inside each test');
});

interface ClassRow {
  id: string;
  code: string;
  label: string;
  sectionCode: string;
  sectionId: string;
  schoolYearId: string;
}

test('create a subject, with the sections it is taught in, then archive it', async ({ page }) => {
  const name = unique('Matière');
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/matieres');
  await expect(page.getByRole('heading', { level: 1, name: 'Matières' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Matières du collège/ })).toBeVisible();
  await axeAtBothWidths(page);

  // The dialog: Axe, Escape, and focus back on the button that opened it.
  const opener = page.getByRole('button', { name: 'Créer une matière' }).first();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Créer une matière' });
  await expect(dialog).toBeVisible();
  await axeAtBothWidths(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // Errors say how to fix the problem.
  await opener.click();
  await dialog.getByRole('button', { name: 'Créer la matière' }).click();
  await expect(dialog.getByText('Saisissez le nom de la matière.')).toBeVisible();
  await dialog.getByLabel('Nom').fill(name);
  await dialog.getByLabel('Groupe').fill('Sciences');
  await dialog.getByLabel('Bac nationale').uncheck();
  await dialog.getByLabel('Bac français').uncheck();
  await dialog.getByRole('button', { name: 'Créer la matière' }).click();
  await expect(dialog.getByText('Cochez au moins une filière.')).toBeVisible();
  await dialog.getByLabel('Bac français').check();
  await dialog.getByRole('button', { name: 'Créer la matière' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Matière « ${name} » créée.`)).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText('Bac français');
  await expect(row).not.toContainText('Bac nationale');

  // Archive: a confirmation first, then it leaves the list.
  await row.getByRole('button', { name: new RegExp(`Archiver ${name}`) }).click();
  const confirm = page.getByRole('dialog', { name: 'Archiver cette matière ?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Archiver la matière' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  await page.getByLabel(/Afficher les matières archivées/).check();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('Archivée');
});

test('set a coefficient inline in the subjects of a class', async ({ page, request }) => {
  const name = unique('Option');
  const headers = await tokenOf(request, ACCOUNTS.admin);
  const created = await request.post('/api/subjects', { headers, data: { name, group: 'Options', sections: ['nationale', 'bac'] } });
  expect(created.status()).toBe(201);
  const classes = (await (await request.get('/api/classes', { headers })).json()) as ClassRow[];
  const target = classes.find((c) => c.sectionCode === 'bac' && c.code === 'seconde')!;

  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, `/admin/classes/${target.id}?onglet=matieres`);
  await expect(page.getByRole('heading', { level: 1, name: target.label })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Matières de la classe' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('table', { name: /Matières de la classe/ })).toBeVisible();
  await axeAtBothWidths(page);

  // Add the subject with a coefficient (decimal comma).
  const add = page.getByRole('button', { name: 'Ajouter une matière' });
  await add.click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter une matière à la classe' });
  await expect(dialog.getByLabel('Matière')).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByLabel('Matière').selectOption({ label: name });
  await dialog.getByLabel('Coefficient').fill('abc');
  await dialog.getByRole('button', { name: 'Ajouter la matière' }).click();
  await expect(dialog.getByText('Le coefficient doit être un nombre')).toBeVisible();
  await dialog.getByLabel('Coefficient').fill('2,5');
  await dialog.getByRole('button', { name: 'Ajouter la matière' }).click();
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();

  const coefficient = page.getByLabel(`Coefficient de ${name}`);
  await expect(coefficient).toHaveValue('2,5');

  // Edit in place: an invalid value is explained and not saved.
  await coefficient.fill('beaucoup');
  await page.getByLabel(`Heures par semaine de ${name}`).focus();
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row.getByRole('status')).toContainText('Le coefficient doit être un nombre');
  // A valid value is saved when the field is left, and the status says so.
  await coefficient.fill('3,5');
  await coefficient.press('Tab');
  await expect(row.getByRole('status')).toHaveText('Enregistré.');
  await page.reload();
  await expect(page.getByLabel(`Coefficient de ${name}`)).toHaveValue('3,5');

  // Hours are optional and saved with Enter.
  const hours = page.getByLabel(`Heures par semaine de ${name}`);
  await hours.fill('1,5');
  await hours.press('Enter');
  await expect(page.getByRole('row', { name: new RegExp(name) }).getByRole('status')).toHaveText('Enregistré.');
  await axeAtBothWidths(page);

  // Remove it again (confirmation first).
  await page.getByRole('button', { name: new RegExp(`Retirer ${name}`) }).click();
  const confirm = page.getByRole('dialog', { name: 'Retirer cette matière de la classe ?' });
  await confirm.getByRole('button', { name: 'Retirer la matière' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  await expect(page.getByText(`« ${name} » est retirée de la classe.`)).toBeVisible();
});

test('copy the subjects of another class', async ({ page, request }) => {
  const headers = await tokenOf(request, ACCOUNTS.admin);
  const classes = (await (await request.get('/api/classes', { headers })).json()) as ClassRow[];
  const source = classes.find((c) => c.sectionCode === 'bac' && c.code === 'seconde')!;
  const code = `copie-${Math.random().toString(36).slice(2, 8)}`;
  const made = await request.post('/api/classes', {
    headers,
    data: { schoolYearId: source.schoolYearId, sectionId: source.sectionId, code, label: `Copie ${code}` },
  });
  expect(made.status()).toBe(201);
  const empty = (await made.json()) as ClassRow;
  try {
    await signInAs(page, ACCOUNTS.admin);
    await goInApp(page, `/admin/classes/${empty.id}?onglet=matieres`);
    await expect(page.getByRole('heading', { name: 'Aucune matière dans cette classe' })).toBeVisible();
    await axeAtBothWidths(page);
    await page.getByRole('button', { name: 'Copier depuis la classe…' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Copier les matières d’une autre classe' });
    await expect(dialog.getByLabel('Copier depuis')).toBeVisible();
    await axeAtBothWidths(page);
    await dialog.getByRole('button', { name: 'Copier les matières' }).click();
    await expect(dialog.getByText('Choisissez la classe à copier.')).toBeVisible();
    await dialog.getByLabel('Copier depuis').selectOption(source.id);
    await dialog.getByRole('button', { name: 'Copier les matières' }).click();
    await expect(page.getByText(/Copié depuis .* matières ajoutées/)).toBeVisible();
    await expect(page.getByRole('table', { name: /Matières de la classe/ })).toBeVisible();
  } finally {
    for (const row of (await (await request.get(`/api/classes/${empty.id}/subjects`, { headers })).json()) as { id: string }[]) {
      await request.delete(`/api/class-subjects/${row.id}`, { headers });
    }
    await request.delete(`/api/classes/${empty.id}`, { headers });
  }
});

test('create a room, edit it, and delete it', async ({ page }) => {
  const name = unique('Salle');
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/salles');
  await expect(page.getByRole('heading', { level: 1, name: 'Salles' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Salles du collège' })).toBeVisible();
  await axeAtBothWidths(page);

  // Keyboard only: focus the button, Enter opens the dialog.
  const opener = page.getByRole('button', { name: 'Créer une salle' }).first();
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Créer une salle' });
  await expect(dialog).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Créer la salle' }).click();
  await expect(dialog.getByText('Saisissez le nom de la salle.')).toBeVisible();
  await dialog.getByLabel('Nom', { exact: true }).fill(name);
  await dialog.getByLabel('Type de salle').selectOption('lab');
  await dialog.getByLabel('Nombre de places').fill('0');
  await dialog.getByRole('button', { name: 'Créer la salle' }).click();
  await expect(dialog.getByText('au moins 1')).toBeVisible();
  await dialog.getByLabel('Nombre de places').fill('24');
  await dialog.getByRole('button', { name: 'Créer la salle' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Salle « ${name} » créée.`)).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText('Laboratoire');
  await expect(row).toContainText('24');
  await expect(row).toContainText('Utilisable');

  // Deactivate it.
  await row.getByRole('button', { name: new RegExp(`Modifier ${name}`) }).click();
  const edit = page.getByRole('dialog', { name: 'Modifier la salle' });
  await edit.getByLabel('Salle utilisable').uncheck();
  await edit.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('Désactivée');

  // Delete it (confirmation first).
  await page.getByRole('button', { name: new RegExp(`Supprimer ${name}`) }).click();
  const confirm = page.getByRole('dialog', { name: 'Supprimer cette salle ?' });
  await axeAtBothWidths(page);
  await confirm.getByRole('button', { name: 'Annuler' }).click();
  await expect(confirm).toBeHidden();
  await page.getByRole('button', { name: new RegExp(`Supprimer ${name}`) }).click();
  await confirm.getByRole('button', { name: 'Supprimer la salle' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  // The row that had focus is gone: focus is on the page heading, not lost.
  await expect(page.getByRole('heading', { level: 1, name: 'Salles' })).toBeFocused();
});

test('create an activity type with a colour, an icon and options, and share a teacher type', async ({ page, request }) => {
  const label = unique('Atelier');
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/types-activite');
  await expect(page.getByRole('heading', { level: 1, name: 'Types d’activité' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Liste des types de l’école' })).toBeVisible();
  await axeAtBothWidths(page);

  await page.getByRole('button', { name: 'Créer un type' }).click();
  const dialog = page.getByRole('dialog', { name: 'Créer un type d’activité' });
  await expect(dialog).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByLabel('Nom').fill(label);
  await dialog.getByLabel('Vert').check();
  await dialog.getByLabel('Cloche').check();
  await dialog.getByLabel(/Chaque semaine/).check();
  await dialog.getByLabel(/Devoir à rendre/).check();
  await dialog.getByRole('button', { name: 'Créer le type' }).click();
  await expect(dialog.getByText('Un devoir à rendre ne se répète pas').first()).toBeVisible();
  await dialog.getByLabel(/Devoir à rendre/).uncheck();
  await dialog.getByLabel(/Noté/).check();
  await dialog.getByRole('button', { name: 'Créer le type' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Type « ${label} » créé.`)).toBeVisible();

  // The colour is never the only cue: the label is in the row and the code is written out.
  const row = page.getByRole('row', { name: new RegExp(label) });
  await expect(row).toContainText('Noté, Chaque semaine');
  await expect(row).toContainText('Partagé avec l’école');

  // A teacher's private type: the admin shares it with the school.
  const mine = unique('Sortie');
  const teacher = await tokenOf(request, ACCOUNTS.teacher);
  const made = await request.post('/api/activity-types', {
    headers: teacher,
    data: { label: mine, colour: 'brick', icon: 'map-pin', gradable: false, repeatable: false, homework: false },
  });
  expect(made.status()).toBe(201);
  await page.reload();
  const own = page.getByRole('table', { name: 'Liste des types des enseignants' });
  await expect(own.getByRole('row', { name: new RegExp(mine) })).toBeVisible();
  await axeAtBothWidths(page);
  await own.getByRole('button', { name: new RegExp(`Partager avec l’école : ${mine}`) }).click();
  const confirm = page.getByRole('dialog', { name: 'Partager ce type avec l’école ?' });
  await confirm.getByRole('button', { name: 'Partager avec l’école' }).click();
  await expect(page.getByText(`« ${mine} » est maintenant un type de l’école.`)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Liste des types de l’école' }).getByRole('row', { name: new RegExp(mine) })).toContainText(
    'Partagé avec l’école',
  );

  // Clean up the two types.
  const admin = await tokenOf(request, ACCOUNTS.admin);
  const types = (await (await request.get('/api/activity-types', { headers: admin })).json()) as { id: string; label: string }[];
  for (const type of types.filter((t) => t.label === label || t.label === mine)) {
    await request.delete(`/api/activity-types/${type.id}`, { headers: admin });
  }
});

test('add a period: the overlap error is shown in French, then a valid period is added', async ({ page, request }) => {
  const headers = await tokenOf(request, ACCOUNTS.admin);
  const years = (await (await request.get('/api/school-years', { headers })).json()) as {
    isCurrent: boolean;
    periods: { kind: string; label: string; startsOn: string; endsOn: string }[];
  }[];
  const existing = years.find((y) => y.isCurrent)!.periods[0]!;
  const typed = (iso: string) => iso.split('-').reverse().join('/');

  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/annees');
  await expect(page.getByRole('heading', { level: 1, name: 'Année scolaire' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Calendrier annuel' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Calendrier annuel 2026-2027/ })).toBeVisible();
  await axeAtBothWidths(page);

  await page.getByRole('button', { name: 'Ajouter une période' }).click();
  const panel = page.getByRole('region', { name: 'Ajouter une période' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Ajouter une période' })).toBeFocused();
  await axeAtBothWidths(page);

  // Typed dates are checked before anything is sent.
  await panel.getByLabel('Début').fill('31/02/2026');
  await panel.getByRole('button', { name: 'Ajouter' }).click();
  await expect(panel.getByText('Cette date n’existe pas')).toBeVisible();

  // Same kind, school-wide, dates that cross an existing period: the API answers 409.
  await panel.getByLabel('Type').selectOption(existing.kind);
  await panel.getByLabel('Début').fill(typed(existing.startsOn));
  await panel.getByLabel('Fin').fill(typed(existing.endsOn));
  await panel.getByRole('button', { name: 'Ajouter' }).click();
  const alert = panel.getByRole('alert');
  await expect(alert).toContainText('Cette période chevauche une autre période du même type');
  await expect(alert).toContainText(`Période en conflit : ${existing.label}`);
  await axeAtBothWidths(page);

  // A valid semester for one section.
  await panel.getByLabel('Type').selectOption('semester');
  await panel.getByLabel('Filière').selectOption({ label: 'Bac français' });
  await panel.getByLabel('Début').fill('06/09/2026');
  await panel.getByLabel('Fin').fill('20/01/2027');
  await panel.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText(/est ajouté\./)).toBeVisible();
  const row = page.getByRole('row', { name: /1er semestre/ });
  await expect(row).toContainText('Bac français');
  await expect(page.getByRole('button', { name: /Semestre : 1er semestre/ })).toBeVisible();
  await axeAtBothWidths(page);

  // Edit it in place from the timeline, then delete it.
  await page.getByRole('button', { name: /Semestre : 1er semestre/ }).click();
  const edit = page.getByRole('region', { name: /Modifier la période : 1er semestre/ });
  await expect(edit.getByLabel('Fin')).toHaveValue('20/01/2027');
  await edit.getByLabel('Fin').fill('31/01/2027');
  await edit.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('row', { name: /1er semestre/ })).toContainText('31 janvier 2027');
  await page.getByRole('row', { name: /1er semestre/ }).getByRole('button', { name: /Supprimer 1er semestre/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Supprimer du calendrier ?' });
  await confirm.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByRole('row', { name: /1er semestre/ })).toHaveCount(0);
});

test('add a holiday and see it on the calendar, then close and reopen a period', async ({ page }) => {
  const label = unique('Vacances');
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/annees');
  await expect(page.getByRole('heading', { level: 2, name: 'Étapes de l’année' })).toBeVisible();
  await expect(page.getByRole('list').filter({ hasText: 'Dates de l’année' })).toBeVisible();

  const opener = page.getByRole('button', { name: 'Ajouter des vacances' });
  await opener.click();
  const panel = page.getByRole('region', { name: /Ajouter des vacances/ });
  await panel.getByLabel('Nom').fill(label);
  await panel.getByLabel('Début').fill('26/03/2027');
  await panel.getByLabel('Fin').fill('03/04/2027');
  await panel.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText(`« ${label} » est ajouté.`)).toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.getByRole('row', { name: new RegExp(label) })).toContainText('du 26 mars 2027 au 3 avril 2027');
  await expect(page.getByRole('button', { name: new RegExp(`Vacances : ${label}.*toute l’école`) }).first()).toBeVisible();

  // Dates outside the year are refused with the year's bounds.
  await opener.click();
  await panel.getByLabel('Nom').fill('Hors année');
  await panel.getByLabel('Début').fill('01/01/2030');
  await panel.getByLabel('Fin').fill('05/01/2030');
  await panel.getByRole('button', { name: 'Ajouter' }).click();
  await expect(panel.getByText(/comprises dans l’année 2026-2027/).first()).toBeVisible();
  await panel.getByRole('button', { name: 'Annuler' }).click();
  await expect(opener).toBeFocused();

  // Delete the holiday again.
  await page.getByRole('row', { name: new RegExp(label) }).getByRole('button', { name: new RegExp(`Supprimer ${label}`) }).click();
  await page.getByRole('dialog', { name: 'Supprimer du calendrier ?' }).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByRole('row', { name: new RegExp(label) })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Année scolaire' })).toBeFocused();

  // Closing a period locks it (admin only); reopening frees it again.
  const term = page.getByRole('row', { name: /3e trimestre/ });
  await term.getByRole('button', { name: /Clôturer 3e trimestre/ }).click();
  const close = page.getByRole('dialog', { name: 'Clôturer cette période ?' });
  await expect(close).toBeVisible();
  await axeAtBothWidths(page);
  await close.getByRole('button', { name: 'Clôturer la période' }).click();
  const locked = page.getByRole('row', { name: /3e trimestre/ });
  await expect(locked).toContainText('Clôturée, verrouillée');
  await expect(locked.getByRole('button', { name: /Modifier 3e trimestre/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Trimestre : 3e trimestre.*verrouillée/ }).first().click();
  await expect(page.getByText('Cette période est clôturée')).toBeVisible();
  await axeAtBothWidths(page);
  await page.getByRole('row', { name: /3e trimestre/ }).getByRole('button', { name: /Rouvrir 3e trimestre/ }).click();
  await page.getByRole('dialog', { name: 'Rouvrir cette période ?' }).getByRole('button', { name: 'Rouvrir la période' }).click();
  await expect(page.getByRole('row', { name: /3e trimestre/ })).toContainText('Ouverte');
});

test('the admin makes a teacher a coordinator, and takes it back', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  await goInApp(page, '/admin/utilisateurs');
  await page.getByRole('tab', { name: /Enseignants/ }).click();
  await expect(page.getByRole('columnheader', { name: 'Coordinateur' })).toBeVisible();
  await axeAtBothWidths(page);
  const row = page.getByRole('row').filter({ hasText: 'hany.mansour' });
  const box = row.getByRole('checkbox', { name: /Coordinateur/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(page.getByText(/est maintenant coordinateur/)).toBeVisible();
  await expect(row.getByRole('checkbox', { name: /Coordinateur/ })).toBeChecked();
  await row.getByRole('checkbox', { name: /Coordinateur/ }).uncheck();
  await expect(page.getByText(/n’est plus coordinateur/)).toBeVisible();
  await expect(row.getByRole('checkbox', { name: /Coordinateur/ })).not.toBeChecked();
});

test('a coordinator sees the structure screens and nothing else of the administration', async ({ page, request }) => {
  await signInAs(page, ACCOUNTS.coordinator);
  await expect(page).toHaveURL(/\/enseignant$/);
  const link = page.getByRole('navigation', { name: 'Espace enseignant' }).getByRole('link', { name: 'Coordination' });
  await link.click();
  await expect(page).toHaveURL(/\/admin\/matieres$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Matières' })).toBeVisible();

  // The navigation holds the structure screens only.
  const nav = page.getByRole('navigation', { name: 'Coordination' });
  for (const name of ['Classes', 'Matières', 'Salles', 'Types d’activité', 'Année scolaire']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  for (const name of ['Utilisateurs', 'Affectations', 'Validations', 'Bulletins', 'Messages']) {
    await expect(nav.getByRole('link', { name })).toHaveCount(0);
  }
  await axeAtBothWidths(page);

  // An admin-only page sends the coordinator back to the structure screens.
  await page.goto('/admin/utilisateurs');
  await expect(page).toHaveURL(/\/admin\/matieres$/);

  // Classes: open one for its subjects; no creation, renaming or deletion, no roster.
  await goInApp(page, '/admin/classes');
  await expect(page.getByRole('heading', { level: 1, name: 'Classes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer une classe' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Renommer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Supprimer/ })).toHaveCount(0);
  await axeAtBothWidths(page);
  await page.getByRole('link', { name: /Matières de/ }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Matières de la classe' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('table', { name: /Matières de la classe/ })).toBeVisible();
  await axeAtBothWidths(page);

  // Activity types: they create private types, and cannot share them with the school.
  await goInApp(page, '/admin/types-activite');
  await expect(page.getByRole('heading', { level: 1, name: 'Types d’activité' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Mes types' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Partager avec l’école/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Modifier Cours/ })).toHaveCount(0);
  await axeAtBothWidths(page);

  // Year: a coordinator edits periods and holidays but neither closes a period nor creates a year.
  await goInApp(page, '/admin/annees');
  await expect(page.getByRole('heading', { level: 2, name: 'Calendrier annuel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nouvelle année' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Clôturer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ajouter une période' })).toBeVisible();
  await axeAtBothWidths(page);

  // What the API says to a coordinator: structure writes yes, accounts no.
  const headers = await tokenOf(request, ACCOUNTS.coordinator);
  expect((await request.get('/api/users', { headers })).status()).toBe(403);
  expect((await request.get('/api/subjects', { headers })).status()).toBe(200);
  expect((await request.get('/api/rooms', { headers })).status()).toBe(200);
  const promote = await request.post('/api/activity-types/00000000-0000-4000-8000-000000000000/promote', { headers });
  expect(promote.status()).toBe(403);
  const close = await request.post('/api/periods/00000000-0000-4000-8000-000000000000/close', { headers });
  expect(close.status()).toBe(403);
});

test('a teacher who is not a coordinator cannot open the administration', async ({ page }) => {
  await signInAs(page, ACCOUNTS.teacher);
  await expect(page).toHaveURL(/\/enseignant$/);
  await expect(page.getByRole('link', { name: 'Coordination' })).toHaveCount(0);
  await page.goto('/admin/matieres');
  await expect(page).toHaveURL(/\/enseignant$/);
});

test('every admin screen is free of Axe violations at 390 and 1440 px, and the phone menu lists them', async ({ page }) => {
  await signInAs(page, ACCOUNTS.admin);
  for (const path of ['/admin/matieres', '/admin/salles', '/admin/types-activite', '/admin/annees', '/admin/classes', '/admin/menu']) {
    await goInApp(page, path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Chargement/)).toHaveCount(0);
    await axeAtBothWidths(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const bottom = page.getByRole('navigation', { name: 'Navigation mobile' });
  await bottom.getByRole('link', { name: 'Plus' }).click();
  await expect(page).toHaveURL(/\/admin\/menu$/);
  for (const name of ['Matières', 'Salles', 'Types d’activité', 'Année scolaire', 'Messages']) {
    await expect(page.getByRole('main').getByRole('link', { name })).toBeVisible();
  }
});

test('a coordinator prepares a year that is not the current one yet', async ({ page, request }) => {
  const admin = await tokenOf(request, ACCOUNTS.admin);
  const label = '2031-2032';
  const sections = (await (await request.get('/api/sections', { headers: admin })).json()) as { id: string; code: string }[];
  const old = ((await (await request.get('/api/school-years', { headers: admin })).json()) as { id: string; label: string }[]).find(
    (y) => y.label === label,
  );
  if (old) await request.delete(`/api/school-years/${old.id}`, { headers: admin });
  const year = (await (
    await request.post('/api/school-years', { headers: admin, data: { label, startsOn: '2031-09-01', endsOn: '2032-06-30' } })
  ).json()) as { id: string };
  const make = async (code: string) =>
    (await (
      await request.post('/api/classes', {
        headers: admin,
        data: { schoolYearId: year.id, sectionId: sections[0].id, code, label: `Classe ${code}` },
      })
    ).json()) as { id: string };
  const first = await make('prepa-a');
  const second = await make('prepa-b');
  const subjects = (await (await request.get('/api/subjects', { headers: admin })).json()) as { id: string }[];
  await request.post(`/api/classes/${first.id}/subjects`, { headers: admin, data: { subjectId: subjects[0].id, coefficient: 3 } });
  try {
    await signInAs(page, ACCOUNTS.coordinator);
    await goInApp(page, '/admin/annees');
    await page.getByLabel('Année affichée').selectOption({ label: label });
    // The dates step is done without the admin making the year current, and the classes step opens that year.
    await expect(page.getByRole('heading', { name: /Dates de l’année/ })).toContainText('Fait');
    await page.getByRole('button', { name: 'Gérer les classes' }).click();
    await expect(page).toHaveURL(/\/admin\/classes\?annee=/);
    await expect(page.getByText('Classe prepa-a', { exact: true })).toBeVisible();
    await expect(page.getByText(/en préparation/)).toBeVisible();

    // « Copier depuis la classe… » lists the classes of that year, not the current one.
    await page.getByRole('link', { name: /Matières de Classe prepa-b/ }).click();
    await page.getByRole('button', { name: 'Copier depuis la classe…' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Copier les matières d’une autre classe' });
    await expect(dialog.getByRole('option', { name: /Classe prepa-a/ })).toHaveCount(1);
    await dialog.getByLabel('Copier depuis').selectOption(first.id);
    await dialog.getByRole('button', { name: 'Copier les matières' }).click();
    await expect(page.getByText(/Copié depuis Classe prepa-a : 1 matière ajoutée/)).toBeVisible();
    await axeAtBothWidths(page);
  } finally {
    for (const id of [first.id, second.id]) {
      for (const row of (await (await request.get(`/api/classes/${id}/subjects`, { headers: admin })).json()) as { id: string }[]) {
        await request.delete(`/api/class-subjects/${row.id}`, { headers: admin });
      }
      await request.delete(`/api/classes/${id}`, { headers: admin });
    }
    await request.delete(`/api/school-years/${year.id}`, { headers: admin });
  }
});
