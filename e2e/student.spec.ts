import { expect, type Browser, type Page, test } from '@playwright/test';
import { PASSWORD, clearFirestore, registerStudent, registerTeacher, uniqueEmail } from './support';

/*
 * The student space, against the Firebase emulators (`npm run test:e2e` starts them): sign-up, what the
 * teachers publish for the student's class (live), homework, grades, profile, and privacy between students.
 */

test.beforeEach(clearFirestore);

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'fr' })).newPage();
}

interface PostInput {
  type: 'announcement' | 'assignment' | 'resource';
  title: string;
  body?: string;
  subject?: string;
  target: string;
  due?: string;
  url?: string;
}

/** What a teacher does in the « Publier » tab. */
async function publish(page: Page, post: PostInput): Promise<void> {
  await page.getByTestId('tab-publish').click();
  await page.getByTestId(`type-${post.type}`).click();
  await page.getByLabel('Titre').fill(post.title);
  await page.getByLabel('Message').fill(post.body ?? '');
  await page.getByLabel('Matière').selectOption({ label: post.subject ?? '— Aucune —' });
  await page.getByLabel('Destinataires').selectOption({ label: post.target });
  if (post.due) await page.getByLabel('À rendre pour le').fill(post.due);
  if (post.url) await page.getByLabel('Lien (https)').fill(post.url);
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('form-message')).toContainText('Publié');
}

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

test('a new student sees an empty space, then exactly what teachers publish for their class, live', async ({ browser }) => {
  const teacher = await freshPage(browser);
  const student = await freshPage(browser);
  await registerTeacher(teacher, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await registerStudent(student, { name: 'Sara Ibrahim', email: uniqueEmail('sara'), section: 'bac', classe: 'Première' });

  // Profile and navigation reflect the account.
  await expect(student.getByTestId('hello')).toHaveText('Bonjour Sara');
  await expect(student.getByTestId('chip-section')).toHaveText('Bac français');
  await expect(student.getByTestId('chip-class')).toHaveText('Première');
  await expect(student.getByTestId('account-link')).toHaveText('Mon espace · Sara');
  await expect(student.getByTestId('empty')).toContainText('Aucune annonce');

  // An announcement for her class appears without reloading; one for another class does not.
  await publish(teacher, { type: 'announcement', title: 'Sortie au musée', body: 'Rendez-vous à 8 h devant le collège.', target: 'Bac français — Première' });
  await expect(student.getByTestId('post-title')).toHaveText('Sortie au musée');
  await expect(student.getByTestId('post')).toContainText('Marc Dupont');
  await publish(teacher, { type: 'announcement', title: 'Réunion des Terminales', target: 'Bac français — Terminale' });
  await publish(teacher, { type: 'announcement', title: 'Bac nationale : calendrier', target: 'Tout le Bac nationale' });
  await publish(teacher, { type: 'announcement', title: 'Fête du collège', target: 'Tous les élèves' });
  await expect(student.getByTestId('post-title')).toHaveText(['Fête du collège', 'Sortie au musée']);
  await expect(student.getByTestId('tab-announcement')).toContainText('(2)');

  // A resource has a safe external link and a subject illustration.
  await publish(teacher, {
    type: 'resource', title: 'Cours sur les dérivées', subject: 'Mathématiques', target: 'Tout le Bac français', url: 'https://example.org/derivees.pdf',
  });
  await student.getByTestId('tab-resource').click();
  const resource = student.getByTestId('post').filter({ hasText: 'Cours sur les dérivées' });
  await expect(resource.getByTestId('post-subject')).toContainText('Mathématiques');
  await expect(resource.locator('img')).toHaveAttribute('src', /matieres\/mathematiques/);
  const link = resource.getByRole('link', { name: /Ouvrir la ressource/ });
  await expect(link).toHaveAttribute('href', 'https://example.org/derivees.pdf');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  await teacher.context().close();
  await student.context().close();
});

test('homework: due dates, class targeting, mark as done, and it survives a reload', async ({ browser }) => {
  const teacher = await freshPage(browser);
  const student = await freshPage(browser);
  await registerTeacher(teacher, { name: 'Léa Martin', email: uniqueEmail('lea') });
  await registerStudent(student, { name: 'Omar Khalil', email: uniqueEmail('omar'), section: 'bac', classe: 'Première' });

  await publish(teacher, { type: 'assignment', title: 'Exercices 12 à 15', subject: 'Mathématiques', target: 'Bac français — Première', due: '2026-11-03' });
  await publish(teacher, { type: 'assignment', title: 'Dissertation', subject: 'Philosophie', target: 'Bac français — Terminale', due: '2026-11-05' });

  await student.getByTestId('tab-assignment').click();
  const todo = student.getByTestId('todo').getByTestId('post');
  await expect(todo).toHaveCount(1);
  await expect(todo.getByTestId('post-title')).toHaveText('Exercices 12 à 15');
  await expect(todo.getByTestId('post-due')).toContainText('À rendre pour le mardi 3 novembre');

  await todo.getByTestId('mark-done').click();
  await expect(student.getByTestId('finished').getByTestId('post-title')).toHaveText('Exercices 12 à 15');
  await expect(student.getByTestId('tab-assignment')).not.toContainText('(1)');

  // Stored, not in memory.
  await student.reload();
  await student.getByTestId('tab-assignment').click();
  await expect(student.getByTestId('finished').getByTestId('post-title')).toHaveText('Exercices 12 à 15');
  await student.getByTestId('finished').getByTestId('mark-undone').click();
  await expect(student.getByTestId('todo').getByTestId('post-title')).toHaveText('Exercices 12 à 15');

  // Moving up to Terminale changes what she sees.
  await student.getByTestId('edit-profile').click();
  await student.getByTestId('profile-class').selectOption({ label: 'Terminale' });
  await student.getByTestId('save-profile').click();
  await expect(student.getByTestId('chip-class')).toHaveText('Terminale');
  await student.getByTestId('tab-assignment').click();
  await expect(student.getByTestId('todo').getByTestId('post-title')).toHaveText('Dissertation');

  await teacher.context().close();
  await student.context().close();
});

test('grades: the teacher enters them by class and student; the student sees marks, comments and averages', async ({ browser }) => {
  const teacher = await freshPage(browser);
  const sara = await freshPage(browser);
  const omar = await freshPage(browser);
  await registerTeacher(teacher, { name: 'Marc Dupont', email: uniqueEmail('marc') });
  await registerStudent(sara, { name: 'Sara Ibrahim', email: uniqueEmail('sara'), section: 'nationale', classe: '3e secondaire (Thanaweya Amma)' });
  await registerStudent(omar, { name: 'Omar Khalil', email: uniqueEmail('omar'), section: 'nationale', classe: '3e secondaire (Thanaweya Amma)' });
  await sara.getByTestId('tab-grades').click();
  await expect(sara.getByTestId('empty')).toContainText('Aucune note');

  await teacher.getByTestId('tab-grades').click();
  await teacher.getByTestId('grade-class').selectOption({ label: 'Bac nationale — 3e secondaire (Thanaweya Amma)' });
  await teacher.getByTestId('student-button').filter({ hasText: 'Sara Ibrahim' }).click();

  // Validation first: the mark must be a number up to the maximum.
  await teacher.getByTestId('grade-subject').selectOption({ label: 'Mathématiques' });
  await teacher.getByLabel('Intitulé (devoir, contrôle…)').fill('Contrôle 1');
  await teacher.getByLabel('Note', { exact: true }).fill('25');
  await teacher.getByTestId('add-grade').click();
  await expect(teacher.getByTestId('form-message')).toContainText('La note doit être un nombre entre 0 et 20');

  await teacher.getByLabel('Note', { exact: true }).fill('14');
  await teacher.getByLabel('Commentaire (facultatif)').fill('Bon travail, soignez la rédaction.');
  await teacher.getByTestId('add-grade').click();
  await expect(teacher.getByTestId('form-message')).toHaveText('Note enregistrée.');
  await expect(teacher.getByTestId('given-grade')).toHaveCount(1);

  await teacher.getByLabel('Intitulé (devoir, contrôle…)').fill('Contrôle 2');
  await teacher.getByLabel('Note', { exact: true }).fill('17');
  await teacher.getByTestId('add-grade').click();
  await expect(teacher.getByTestId('given-grade')).toHaveCount(2);

  // Sara sees them live, with the average on 20.
  const subject = sara.getByTestId('subject-grades');
  await expect(subject.getByTestId('grade')).toHaveCount(2);
  await expect(subject.getByTestId('subject-average')).toHaveText('Moyenne : 15,5 / 20');
  await expect(sara.getByTestId('overall')).toContainText('15,5 / 20');
  await expect(subject.getByTestId('grade').filter({ hasText: 'Contrôle 1' })).toContainText('Bon travail, soignez la rédaction.');
  await expect(subject.getByTestId('grade').filter({ hasText: 'Contrôle 1' }).getByTestId('grade-score')).toHaveText('14 / 20');
  await expect(subject.locator('img')).toHaveAttribute('src', /matieres\/mathematiques/);

  // Omar, in the same class, sees none of Sara's grades.
  await omar.getByTestId('tab-grades').click();
  await expect(omar.getByTestId('empty')).toContainText('Aucune note');

  // A grade can be withdrawn.
  await teacher.getByTestId('given-grade').filter({ hasText: 'Contrôle 2' }).getByRole('button', { name: /Supprimer/ }).click();
  await expect(subject.getByTestId('grade')).toHaveCount(1);
  await expect(subject.getByTestId('subject-average')).toHaveText('Moyenne : 14 / 20');

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
