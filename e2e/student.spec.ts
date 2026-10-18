import { expect, type Browser, type Page, test } from '@playwright/test';
import { PASSWORD, addEvent, announce, clearFirestore, isoDay, registerStudent, registerTeacher, uniqueEmail } from './support';

/*
 * The student space, against the Firebase emulators (`npm run test:e2e` starts them): one page with what
 * is coming, the class calendar, grades and announcements — all written by teachers, live.
 */

test.beforeEach(clearFirestore);

const freshPage = async (browser: Browser): Promise<Page> => (await browser.newContext({ locale: 'fr' })).newPage();

test('signed out: the student space asks to sign in', async ({ page }) => {
  await page.goto('/espace-eleve');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espace élève');
  await expect(page.getByRole('tab', { name: 'Connexion' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('account-link')).toHaveText('Espace élève');
  await expect(page.getByTestId('teacher-link')).toHaveText('Espace enseignant');
});

test('forms validate in French and sign-in errors are explained', async ({ page }) => {
  await page.goto('/espace-eleve');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Saisissez votre adresse e-mail.')).toBeVisible();

  await page.getByLabel('Adresse e-mail').fill('inconnu@example.org');
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByTestId('form-message')).toHaveText('E-mail ou mot de passe incorrect.');

  await page.getByTestId('tab-register').click();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByText('Saisissez votre nom et prénom.')).toBeVisible();
  await page.getByLabel('Nom et prénom').fill('Test');
  await page.getByLabel('Adresse e-mail').fill('pas-un-email');
  await page.getByLabel('Mot de passe').fill('court');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible();
  await expect(page.getByText('Le mot de passe doit contenir au moins 8 caractères.')).toBeVisible();
});

test('one page: next exam, today, homework, calendar and announcements — only for my class, live', async ({ browser }) => {
  const teacher = await freshPage(browser);
  const student = await freshPage(browser);
  await registerTeacher(teacher, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await registerStudent(student, { name: 'Sara Ibrahim', email: uniqueEmail('sara'), section: 'bac', classe: 'Première' });

  await expect(student.getByTestId('hello')).toHaveText('Bonjour Sara');
  await expect(student.getByTestId('account-link')).toHaveText('Mon espace · Sara');
  await expect(student.getByTestId('next-exam')).toContainText('Aucun examen prévu');
  await expect(student.getByTestId('todo-empty')).toBeVisible();
  await expect(student.getByTestId('grades-empty')).toBeVisible();
  await expect(student.getByTestId('posts-empty')).toBeVisible();

  // The teacher fills the calendar; the student's page updates without reloading.
  await addEvent(teacher, { kind: 'cours', title: 'Cours de mathématiques', subject: 'Mathématiques', target: 'Bac français — Première', start: '08:00', end: '09:00', place: 'Salle 4', weeklyUntil: isoDay(60) });
  await addEvent(teacher, {
    kind: 'examen', title: 'Examen de mathématiques', subject: 'Mathématiques', target: 'Bac français — Première', date: isoDay(3), start: '08:30', end: '10:30',
    place: 'Salle 12', coefficient: '2', description: 'Calculatrice autorisée.',
    links: [{ label: 'Correction en vidéo', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, { label: 'Sujet de l’an dernier', url: 'https://example.org/sujet.pdf' }],
  });
  await addEvent(teacher, { kind: 'examen', title: 'Examen des Terminales', target: 'Bac français — Terminale', date: isoDay(2) });
  await addEvent(teacher, { kind: 'devoir', title: 'Exercices 12 à 15', subject: 'Mathématiques', target: 'Bac français — Première', date: isoDay(1) });
  await announce(teacher, { title: 'Sortie au musée', body: 'Rendez-vous à 8 h.', target: 'Bac français — Première' });
  await announce(teacher, { title: 'Réunion des Terminales', target: 'Bac français — Terminale' });

  // What is coming: the Première exam (not the Terminale one, although it is sooner), today's class, homework.
  await expect(student.getByTestId('next-exam')).toContainText('Examen de mathématiques');
  await expect(student.getByTestId('next-exam-countdown')).toHaveText('Dans 3 jours');
  await expect(student.getByTestId('today')).toContainText('Cours de mathématiques');
  await expect(student.getByTestId('todo-title')).toHaveText(['Exercices 12 à 15']);
  await expect(student.getByTestId('agenda').getByTestId('cal-event-title').filter({ hasText: 'Cours de mathématiques' }).first()).toBeVisible();
  await expect(student.getByText('Examen des Terminales')).toHaveCount(0);
  await expect(student.getByTestId('announcements').getByTestId('post-title')).toHaveText(['Sortie au musée']);

  // Opening the exam: details, the video plays in the window, documents open safely in a new tab.
  await student.getByTestId('next-exam').getByRole('button').click();
  const dialog = student.getByTestId('event-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('ev-kind')).toHaveText('Examen');
  await expect(dialog.getByTestId('ev-place')).toHaveText('Salle 12');
  await expect(dialog.getByTestId('ev-when')).toContainText('08:30 – 10:30');
  await expect(dialog.getByTestId('ev-description')).toHaveText('Calculatrice autorisée.');
  await expect(dialog.getByTestId('ev-video')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  const pdf = dialog.getByTestId('ev-link');
  await expect(pdf).toHaveAttribute('href', 'https://example.org/sujet.pdf');
  await expect(pdf).toHaveAttribute('rel', /noopener/);
  await expect(dialog.getByTestId('ev-edit')).toHaveCount(0);
  await expect(dialog.getByTestId('ev-delete')).toHaveCount(0);
  await student.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // A different class sees none of it; moving up to Terminale changes everything.
  await student.getByTestId('edit-profile').click();
  await student.getByTestId('profile-class').selectOption({ label: 'Terminale' });
  await student.getByTestId('save-profile').click();
  await expect(student.getByTestId('chip-class')).toHaveText('Terminale');
  await expect(student.getByTestId('next-exam')).toContainText('Examen des Terminales');
  await expect(student.getByTestId('announcements').getByTestId('post-title')).toHaveText(['Réunion des Terminales']);
  await expect(student.getByTestId('todo-empty')).toBeVisible();

  await teacher.context().close();
  await student.context().close();
});

test('homework: tick it as done from the page or the window, and it stays done after a reload', async ({ browser }) => {
  const teacher = await freshPage(browser);
  const student = await freshPage(browser);
  await registerTeacher(teacher, { name: 'Léa Martin', email: uniqueEmail('lea') });
  await registerStudent(student, { name: 'Omar Khalil', email: uniqueEmail('omar'), section: 'nationale', classe: '2e secondaire' });
  await addEvent(teacher, { kind: 'devoir', title: 'Résumé du chapitre 3', target: 'Bac nationale — 2e secondaire', date: isoDay(2) });
  await addEvent(teacher, { kind: 'devoir', title: 'Fiche de lecture', target: 'Tout le Bac nationale', date: isoDay(5) });

  await expect(student.getByTestId('todo-title')).toHaveText(['Résumé du chapitre 3', 'Fiche de lecture']);
  await student.getByTestId('todo-check').first().check();
  await expect(student.getByTestId('todo-title')).toHaveText(['Fiche de lecture']);

  await student.reload();
  await expect(student.getByTestId('todo-title')).toHaveText(['Fiche de lecture']);

  // Undo from the window.
  const agenda = student.getByTestId('agenda');
  const day = agenda.locator(`[data-testid="cal-day"][data-day="${isoDay(2)}"]`);
  if (!(await day.count())) await agenda.getByTestId('cal-next').click();
  await day.getByTestId('cal-event').filter({ hasText: 'Résumé du chapitre 3' }).click();
  const done = student.getByTestId('ev-done');
  await expect(done).toHaveAttribute('aria-pressed', 'true');
  await done.click();
  await expect(done).toHaveAttribute('aria-pressed', 'false');
  await student.keyboard.press('Escape');
  await expect(student.getByTestId('todo-title')).toHaveText(['Résumé du chapitre 3', 'Fiche de lecture']);

  await teacher.context().close();
  await student.context().close();
});

test('grades: entered for an exam in one grid, invisible until published, then shown with coefficient and average', async ({ browser }) => {
  const teacher = await freshPage(browser);
  const sara = await freshPage(browser);
  const omar = await freshPage(browser);
  await registerTeacher(teacher, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await registerStudent(sara, { name: 'Sara Ibrahim', email: uniqueEmail('sara'), section: 'nationale', classe: '3e secondaire (Thanaweya Amma)' });
  await registerStudent(omar, { name: 'Omar Khalil', email: uniqueEmail('omar'), section: 'nationale', classe: '3e secondaire (Thanaweya Amma)' });
  await addEvent(teacher, { kind: 'controle', title: 'Contrôle 1', subject: 'Mathématiques', target: 'Bac nationale — 3e secondaire (Thanaweya Amma)', date: isoDay(-1), coefficient: '2' });

  // The grid lists the class; validation first.
  await teacher.getByTestId('gradable-event').filter({ hasText: 'Contrôle 1' }).getByTestId('open-grades').click();
  const grid = teacher.getByTestId('grade-grid');
  await expect(grid.getByTestId('gg-row')).toHaveCount(2);
  const row = (name: string) => grid.getByTestId('gg-row').filter({ hasText: name });
  await row('Sara Ibrahim').getByTestId('gg-score').fill('25');
  await grid.getByTestId('gg-save').click();
  await expect(grid.getByTestId('gg-message')).toContainText('La note de Sara Ibrahim doit être un nombre entre 0 et 20');

  // Draft: saved, but students see nothing.
  await row('Sara Ibrahim').getByTestId('gg-score').fill('14,5');
  await row('Sara Ibrahim').getByTestId('gg-comment').fill('Bon travail, soignez la rédaction.');
  await row('Omar Khalil').getByTestId('gg-score').fill('17');
  await grid.getByTestId('gg-save').click();
  await expect(grid.getByTestId('gg-message')).toContainText('brouillon');
  await expect(grid.getByTestId('gg-summary')).toContainText('2 / 2 notes saisies · moyenne de la classe 15,8 / 20');
  await expect(teacher.getByTestId('gradable-status')).toHaveText('2 notes · brouillon');
  await expect(sara.getByTestId('grades-empty')).toBeVisible();

  // Published: each student sees their own mark only, live.
  await grid.getByTestId('gg-published').check();
  await grid.getByTestId('gg-save').click();
  await expect(grid.getByTestId('gg-message')).toContainText('publiées');
  await expect(teacher.getByTestId('gradable-status')).toHaveText('2 notes · publiées');
  await expect(sara.getByTestId('subject-average')).toHaveText('14,5 / 20');
  await expect(sara.getByTestId('overall')).toContainText('14,5 / 20');
  await sara.getByTestId('subject-grades').locator('summary').click();
  await expect(sara.getByTestId('grade')).toContainText('Bon travail, soignez la rédaction.');
  await expect(sara.getByTestId('grade')).toContainText('(coef. 2)');
  await expect(omar.getByTestId('subject-average')).toHaveText('17 / 20');
  await expect(omar.getByText('Bon travail, soignez la rédaction.')).toHaveCount(0);

  // A correction is a new value in the same grid; emptying a mark removes it.
  await row('Sara Ibrahim').getByTestId('gg-score').fill('16');
  await row('Omar Khalil').getByTestId('gg-score').fill('');
  await grid.getByTestId('gg-save').click();
  await expect(sara.getByTestId('subject-average')).toHaveText('16 / 20');
  await expect(omar.getByTestId('grades-empty')).toBeVisible();

  await teacher.context().close();
  await sara.context().close();
  await omar.context().close();
});

test('sign out, then sign back in from another browser: everything is still there', async ({ page, browser }) => {
  const email = uniqueEmail('nour');
  await registerStudent(page, { name: 'Nour Hassan', email, section: 'nationale', classe: '2e secondaire' });
  await page.getByTestId('logout').click();
  await expect(page.getByRole('tab', { name: 'Connexion' })).toBeVisible();
  await expect(page.getByTestId('account-link')).toHaveText('Espace élève');

  const other = await freshPage(browser);
  await other.goto('/espace-eleve');
  await other.getByLabel('Adresse e-mail').fill(email);
  await other.getByLabel('Mot de passe').fill(PASSWORD);
  await other.getByRole('button', { name: 'Se connecter' }).click();
  await expect(other.getByTestId('hello')).toHaveText('Bonjour Nour');
  await expect(other.getByTestId('chip-class')).toHaveText('2e secondaire');
  await other.context().close();
});

test('a teacher who opens the student space is sent to the teacher space', async ({ page }) => {
  await registerTeacher(page, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await page.goto('/espace-eleve');
  await expect(page.getByTestId('is-teacher')).toBeVisible();
  await page.getByRole('link', { name: 'Ouvrir l’Espace enseignant' }).click();
  await expect(page).toHaveURL(/\/espace-enseignant$/);
  await expect(page.getByTestId('teacher-dashboard')).toBeVisible();
});
