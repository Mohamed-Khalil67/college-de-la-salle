# Browser test coverage (Playwright, `apps/web/e2e`)

Workflow → spec. Every screen a workflow opens is checked with Axe at 390 and 1440 px inside the spec; every
spec cleans up after itself (README, « Browser tests »). New on `test/qa-workflows` in bold.

| Workflow | Spec |
|---|---|
| **Sign out from the account menu; `/admin` then goes to `/connexion?suite=%2Fadmin` and back after sign-in; a full reload keeps the session** | **`session.spec.ts`** |
| Sign in, wrong password, the spaces' pages and menus | `spaces.spec.ts`, `all-screens.spec.ts`, `design-conformance.spec.ts` |
| Forgotten password by e-mail | `password-reset.spec.ts` |
| **The admin creates one account (temporary password shown once), its owner signs in and chooses a password, the admin disables it and it can no longer sign in** | **`account-lifecycle.spec.ts`** |
| First sign-in of an imported student, password change from the account menu, section change asked and approved or refused, roster import, graduation, archiving a class | `accounts.spec.ts` |
| Planificateur permission given and taken back | `structure.spec.ts` |
| **Teaching assignment (« Affectations »): assign, see it in the teacher's « Mes classes », remove** | **`assignments.spec.ts`** |
| Subjects, class subjects, rooms, activity types, periods, holidays, closing and reopening a term, a planner's year | `structure.spec.ts` |
| Timetable editor: build, room conflict fixed with a suggested room, keyboard grid, cancel a session (student sees it), teacher read-only | `timetable.spec.ts` |
| **Timetable editor: a slot that puts a class in two places is refused, the conflict named, free times offered; a suggested time saves it** | **`timetable-conflict.spec.ts`** |
| Planner's page, « Professeur absent », late 409, moved lesson | `planner-home.spec.ts`, `planner-gaps.spec.ts` |
| « Ajouter un examen » | `planner-add-exam.spec.ts` |
| Groups and « Assigner à » (homework, grade grid, roll call of a group) | `groups.spec.ts` |
| « Noter » quick grading, publish, the student sees the mark | `quick-grading.spec.ts`, `design-conformance.spec.ts` |
| **Report cards: close a term, generate a class's cards, write and save an appreciation, publish; the student reads « Bulletin du … » and the PDF answers 200 `application/pdf`** | **`report-cards.spec.ts`** |
| « Préparer les bulletins », « Relancer » | `admin-home.spec.ts`, `design-conformance.spec.ts` |
| **A teacher's weekly agenda event (« Chaque semaine »): created, on two weeks in a row, edited, deleted for every week** | **`agenda-weekly.spec.ts`** |
| Event types offered in the agenda | `spaces.spec.ts` |
| **A teacher's announcement to one class: on the home page of a student of that class, not for a student of another class** | **`announcements.spec.ts`** |
| The admin's announcement to the whole school | `admin-home.spec.ts` |
| Roll call saved | `spaces.spec.ts` |
| **An absence recorded at « Appel » listed on the student's Absences page with its day and subject** | **`absences.spec.ts`** |
| Notifications of a cancelled session, the bell, e-mail preference; calendar feed page | `agenda-notifications.spec.ts` |
| Student home, teacher home, admin home (blocks, errors, empty states) | `eleve-home.spec.ts`, `teacher-home.spec.ts`, `admin-home.spec.ts`, `design-conformance.spec.ts` |
| Contact form, messages inbox (handle, delete) | `spaces.spec.ts`, `public-site.spec.ts` |
| Next-year rollover | `rollover.spec.ts` |
| Public site in fr/en/ar | `public-site.spec.ts` (`npm run e2e:public`), `school-smoke.spec.ts` (`npm run e2e:smoke`) |

Helpers: `structure.ts` (sign-in, in-app navigation, Axe), `school-weeks.ts` (weeks with lessons, gradable days),
`cleanup.ts` (admin API, archiving, fixture years), `global-setup.ts` (the stack answers and the accounts sign in).
