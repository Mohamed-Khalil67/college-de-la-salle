# Introducing the platform to teachers and students

Draft for the school. It assumes the college runs a small pilot first, then opens the platform to everyone.

## What each role can do today

| Role | Can do | Cannot do (yet) |
|---|---|---|
| **Student** | Open on one page of five blocks (see below); see the week's timetable; tick homework as done; read published grades with averages per subject and overall; see absences; read and download report cards (PDF); read announcements for their class | See other students' data |
| **Teacher** | See their classes; add, edit and delete calendar events (course, exam, homework, with links and weekly repeat); grade a class straight away (« Noter »: new note, marks in a grid, finish later, publish) or enter marks for an agenda event; take attendance; post announcements to a class or section | Edit another teacher's class; open the admin area |
| **Admin / secretariat** | Create accounts one by one or by CSV import; manage classes, enrolments, teaching assignments, school years and terms; generate, edit and publish report cards; read messages from the contact form | n/a |

## What the student sees on opening the platform

The student lands on one page, `/eleve`, made of blocks. Each block shows only what is checked every day and ends with one button to its detail page. On a phone the blocks stack in this order; from tablet width the three middle ones sit side by side.

| Block | Shows | Button |
|---|---|---|
| **Maintenant** (full width, navy) | The class in progress (subject, room, teacher, end time) or « Prochain cours · dans 12 min »; a calm message when the day is over, on a holiday or on Friday and Saturday; today's classes in a row (past ones quieter, the current one outlined and marked « En cours », cancelled, moved or replaced ones written out) | Emploi du temps de la semaine |
| **À faire** | The next homework with its tick box (ticking works here) and the tests and exams of the next two weeks with their day | Tous les devoirs et contrôles |
| **Notes** | The overall average of the current term, the three latest published grades, and « Bulletin publié » once the term's report card is published | Toutes les notes et le bulletin |
| **Absences** | Absences and late arrivals of the current term and the most recent one | Détail des absences |
| **Annonces** (full width) | The two latest announcements for the student's class and section | Toutes les annonces (new page `/eleve/annonces`) |

Each block loads on its own: if one fails it shows its own message and the rest of the page stays usable. The menu is unchanged for now.

## Gaps to close before the school launch

1. **Passwords.** Done: everyone changes the temporary password at first sign-in, can change it later from their space, and can reset a forgotten one by e-mail. The reset needs the school's SMTP details (`docs/deployment.md`).
2. **Backups and hosting.** The Docker deployment with nightly backups and HTTPS is ready (`deploy/`, `docs/deployment.md`) but not live: it waits for the login e-mail domain, SMTP details and a Cloudflare tunnel token or domain. The school must not rely on the platform for grades until it runs on the school's server.
3. **Real data.** Replace the demo data: import the real classes, teachers and students (CSV).
4. **Parents.** Not in this version. Say so up front: families see report cards only if the student shows them.

## Live demo script (about 15 minutes, one browser, three accounts)

Use the demo accounts from `apps/api/demo-credentials.local.md` on a copy of the data, never on the real school database.

1. **Admin (3 min).** Sign in as admin. Show Utilisateurs (search, tabs), import a small CSV, create a class and an assignment, then Bulletins.
2. **Teacher (5 min).** Sign in as a teacher. Open Saisie des notes, click « Nouvelle note » (name, Sur, Coefficient), type the marks (decimal comma works, Enter goes to the next student, an empty cell is an absent student and does not count), watch the « Enregistré · 4 / 27 · moyenne 14,2 » line, click « Finir plus tard », reopen the draft from « À finir », then « Publier aux élèves » and confirm. Sign in as that class's student to see the grade. (Planned exams created in Agenda appear in the same « À finir » list.) Take attendance in Appel. Post an announcement to one class.
3. **Student (4 min).** Sign in as a student of that class. The home page shows everything at a glance: show that the exam (in « À faire »), the published grade (« Notes »), the announcement and the absence now appear; tick a homework as done right on the page; use the button at the end of a block to open its detail page and the report card.
4. **Back to the admin (3 min).** Close a term, generate report cards, publish them, and show the student's PDF.

Tip: use two browser profiles (or a private window) so the sessions don't replace each other.

## Rollout plan

| Week | Who | What |
|---|---|---|
| 0 | Secretariat | Import the real accounts. Hand out temporary passwords on paper (one slip per person), never by group chat. |
| 1 | 2 to 3 teachers, one class | Pilot: homework, grades, attendance for one week. Collect what confused them. |
| 2 | All teachers | A 30-minute session using the demo script above, then 15 minutes where each teacher signs in and posts one announcement. A one-page "Premiers pas" sheet in French (and Arabic if the school wants it). |
| 3 | Students, class by class | Teachers show the screen in class for 10 minutes: sign in, find homework, find grades. Start with the oldest classes. |
| 4 | Whole school | Report cards of the term are published on the platform. Announce it to families with a short letter explaining the student sign-in. |

## What makes it stick

- **One thing teachers must use at first:** homework and grades. Don't ask for everything at once.
- **One person to ask:** a named contact at the secretariat and a shared mailbox for problems. The contact form on the site also reaches the admin.
- **Visible benefit for students:** publish grades only on the platform from week 3, so there is a reason to sign in.
- **Feedback loop:** a short form after the pilot and again after a month. Fix the top three complaints before widening the rollout.
