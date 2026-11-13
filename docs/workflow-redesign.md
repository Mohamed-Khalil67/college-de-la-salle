# Workflow redesign: one page per role

Agreed with the owner on 12 November 2026, in a step-by-step brainstorm with drawings. Build status is at the end. Read with `docs/school-year-design.md` (the data model this sits on) and `docs/architecture.md`.

## Decisions

1. **One page per role.** Each space opens on a single page that shows everything at a glance, in blocks. Each block
   shows only what is checked every day and ends with **one entry button** ("… →") to its detail page. No bar of many
   tabs. On a phone the same blocks stack in the same order.
2. **New permission: Planificateur** (EN *Scheduler*, AR *منسّق الجداول*). It owns time and place: timetable, annual
   calendar (periods, holidays, exam weeks), rooms, activity types, conflicts and day-to-day changes. It is a
   **permission on any account** (a teacher or a secretary can hold it with one login), not a fourth account type. It
   replaces today's coordinator flag.
3. **Teachers grade straight away.** « Noter » needs no calendar event first. Official exams set by the Planificateur
   appear in the same list, so both kinds live in one grade book.
4. **Teachers no longer build the calendar or the timetable.** They give homework and grades; the Planificateur
   handles exams, rooms and changes.
5. The admin keeps accounts, classes and enrolments, report cards, approvals, roles, messages and the new year.

## The four pages

### Élève
| Block | Shows | Entry button |
|---|---|---|
| Maintenant (wide) | current or next class (subject, room, teacher, end time) and today's classes in a row | Emploi du temps de la semaine |
| À faire | homework (ticked here), upcoming tests | Tous les devoirs et contrôles |
| Notes | overall average, latest grades | Toutes les notes et le bulletin |
| Absences | count for the term, latest | Détail des absences |
| Annonces (wide) | latest announcement | Toutes les annonces |

Folds in today's separate pages: Tableau de bord, Emploi du temps, Examens et devoirs, Devoirs, Notes, Absences,
Bulletins, Ma section. Notifications stay behind the bell; « Synchroniser mon agenda » moves to the account menu.

### Enseignant
| Block | Shows | Entry button |
|---|---|---|
| Mes cours aujourd'hui (wide) | each class of the day with **Appel**, **Noter**, **Devoir**; the current one highlighted; past ones show « Appel fait » | Mon emploi du temps de la semaine |
| Notes à finir | drafts and half-entered grades (18 / 27), reminders from the admin | Mon carnet de notes |
| Devoirs donnés | homework with how many students ticked it | Tous mes devoirs |
| À surveiller | repeated absences, planned shared exams | Mes classes |
| Annonces (wide) | latest | Écrire ou lire les annonces |

Header button « Nouvelle note » grades any class, not only today's.

**Noter (detail):** 1. choose: *Nouvelle note* (name, out of, coefficient), a planned exam, or a draft; 2. type the
marks, Enter goes to the next student, « Abs » does not count, comment optional, autosave, live class average;
3. « Publier aux élèves » or « Finir plus tard » (stays in Notes à finir).

### Planificateur
| Block | Shows | Entry button |
|---|---|---|
| À régler (red) | clashes: room twice, teacher twice, missing hours | Régler les conflits (existing suggestions) |
| Changements aujourd'hui | absences to cover, room changes, whether students were told | Toutes les modifications |
| Salles maintenant | free rooms and until when | Occupation des salles |
| L'année (wide) | strip of terms, exam weeks, holidays; next key date | Calendrier de l'année |
| Emplois du temps (wide) | classes complete / incomplete, teachers placed | Ouvrir la grille (classe, professeur, salle) |

Header buttons « Professeur absent » and « Ajouter un examen ».

**Professeur absent (detail):** 1. teacher and dates; 2. for each lesson: *Remplacer* (suggests a free teacher of the
same subject, or says none is free), *Étude surveillée* (a supervisor and room), or *Annuler*; 3. « Enregistrer et
prévenir » writes the changes and notifies the students and the covering teachers. The weekly timetable, homework and
tests are not touched.

### Administration
| Block | Shows | Entry button |
|---|---|---|
| À valider (amber) | section-change requests, accounts never activated | Tout valider |
| Messages | new contact-form messages | Boîte de réception |
| Classes | count, average size, students without a class | Classes et inscriptions |
| Bulletins (wide) | grade progress for the term, closing date, late teachers | Préparer les bulletins |
| Rôles | who is Planificateur / admin | Comptes et droits |
| Année scolaire | current year, next rollover | Nouvelle année |
| Annonces | latest | Écrire une annonce |

Header buttons « Ajouter un compte » and « Importer une liste ».

**Préparer les bulletins (detail):** 1. per class, complete or not, with the missing subject and teacher; « Relancer »
sends a reminder into the teacher's Notes à finir; complete classes can be generated at once; 2. review and add the
class-council comments; 3. publish (the student's Notes block shows « Bulletin publié »).

## How the pages connect
- Planificateur sets an exam → it appears in the teacher's Noter list and the students' À faire.
- Teacher publishes grades → student's Notes block and the admin's Bulletins progress.
- Admin « Relancer » → teacher's Notes à finir.
- Planificateur « Professeur absent » → students' Maintenant strip and notifications, covering teacher's day.

## What it changes in the code (checked on main, 12 Nov 2026)
- **Permission.** Today `Teacher.isCoordinator` (teachers only) and `apps/api/src/access/grants.ts` (`'coordinator'`
  grant). The Planificateur must be on `User` (a secretary is not a teacher): new migration adding
  `users.is_planner boolean not null default false`, backfilled from `teachers.is_coordinator`, then the grant renamed
  `planner` and the coordinator flag dropped in a later migration. Contract in `packages/shared/src/api.ts`
  (`SessionUser.isPlanner`). Timetable, calendar days, periods, rooms, activity types and exams move to this grant;
  subjects and classes stay with the admin (decide with the owner whether the Planificateur also edits subjects).
- **Quick grading.** Grades hang on a gradable `Event`. « Nouvelle note » creates that event behind the scenes (today's
  date, no time, the class, the current period, the chosen coefficient), so no schema change; one endpoint creates the
  event and its sheet in one call. Teachers lose create/edit of other event types except homework.
- **Professeur absent.** `SlotException` already has `cancelled`, `substitute`, `room_change`, `moved`. *Étude
  surveillée* needs a new kind `study` (supervisor in `newTeacherId`, room in `newRoomId`) in a migration. One endpoint
  takes the teacher, the dates and one choice per session, writes the exceptions in one transaction, and sends the
  notifications. Suggestions reuse the occupancy index.
- **Reminders.** « Relancer » is a new notification type to the teacher; the completeness per class reads the
  assessment targets already used by report cards.
- **Pages.** Each space gets one home component built from small block components (one per block, each with its own
  `httpResource`), and a summary endpoint per role only if the blocks prove slow. Existing detail pages stay as the
  targets of the entry buttons; the nav bars (`layout/space-navs.ts`) shrink to the home plus the account menu.

## Build order (one feature per agent, own worktree and branch, as `CLAUDE.md` says)
1. **Planificateur permission** (API + shared + admin Rôles block). Skills: `nestjs-best-practices`, `/security-review`.
2. **Quick grading endpoint** and the **Noter** screen. Skills: `nestjs-best-practices`, `angular-developer`,
   `frontend-design`, `design:accessibility-review`, `design:ux-copy`.
3. **Student one page.**
4. **Teacher one page** (after 2). Built 12 Nov 2026 on `feat/teacher-one-page`; « Appel fait » and repeated absences are left for a summary endpoint (see `docs/rollout.md`).
5. **Professeur absent** (migration for `study`, endpoint, screen) and the **Planificateur one page** (after 1).
6. **Admin one page** and **Préparer les bulletins** with « Relancer » (after 1). **Built** (branch `feat/admin-page`): `apps/web/src/app/features/admin/accueil/`, `bulletins/report-preparation-page.ts`, `annonces/`; API `report-cards/report-preparation.*`, notification kind `grades_reminder`. Step 7 (nav cleanup, `feat/nav-cleanup`) is built: see « The menus » in `docs/rollout.md`. Left over: « generate the complete classes at once » (the page links to the existing Bulletins page).
7. **Built** (`feat/nav-cleanup`): old nav entries removed (routes kept), update `docs/rollout.md` and the demo script, run the full Playwright + Axe suite at 390
   and 1440 px.

Steps 1, 2 and 3 can run in parallel (different files). UI work follows the owner's kit
`github.com/Mohamed-Khalil67/frontend-ai-kit-by-Mk` (`frontend-lead` routing, `css-styling`, `my-coding-habits`) on top
of the skills above; `CLAUDE.md` wins where they differ.

## Built: the Planificateur page and « Professeur absent » (step 5)
- `/admin/planification` (`features/admin/planification/`), the five blocks of the table above, the two header buttons.
  « Ajouter un examen » opens the agenda's event form for a planner who teaches; for an admin account it is hidden, because only
  a teacher can create an event today (`POST /events`): the exam creation for a planner without a teacher profile is
  not built.
- « Professeur absent » end to end (`/admin/planification/professeur-absent`, `POST /planner/absence`): a new
  `SlotExceptionKind` `study` (migration `20261112100000`), one transaction with the audit rows and the notifications
  (`session_substituted`, `session_study`, to the class, the lesson's teacher and the covering teacher). A covering
  teacher is a free teacher of the subject first. The weekly timetable, homework and tests are not touched.
- « À régler » shows the stored timetable's soft warnings of the next two weeks and the classes that still miss hours
  (two sessions can never share a room or a teacher: the database refuses it, so nothing else can be red). The class
  hours come from `ClassSubject.hoursPerWeek`; a subject without hours asks for nothing.
- Teachers' « Mon emploi du temps » is read-only. Left: the teacher's agenda still creates every event type (homework,
  exams, meetings) because the grading and homework flows use it; the doc's « teachers lose other event types » is
  step 2's API change.
- Naming a substitute from the timetable editor now notifies too (it was silent before).

## Fixed after the first build: suggestions and moved lessons (branch `fix/planner-gaps`)
- **One teacher, one lesson at a time.** The free-teacher lists of « Professeur absent » are computed lesson by
  lesson, so the same teacher could be proposed for two lessons at the same time and the save then failed with a 409.
  The pure rules are `packages/shared/src/absence-cover.ts` (`offerable`, `proposeCover`, `reconcileCovers`, spec next
  to it): a teacher held by a lesson is not offered for an overlapping one (touching lessons do not overlap), and the
  « Remplacer » proposal skips them. The page (`absence-logic.ts`, `absence-page.ts`) offers only what is left and
  flags a double pick on the later lesson.
- **A late 409** (the teacher was given another lesson meanwhile): the page reads the lessons again, keeps every other
  choice, replaces the teacher who is no longer free with a new proposal (or nobody) and says so in a message
  (« … n’est plus libre pour … : … est proposé à sa place. », focus on it), instead of the generic conflict box. A
  conflict that is not about a covering teacher still shows as before.
- **A moved lesson shows once.** In the week views (student, teacher, planner grid, today's rows) it is a real session
  on the day it moved to (« Déplacée », with « Avant : … »); its old day keeps only the struck-through trace
  « Déplacée au Jeu. 5 nov. » (the agreed design: `moved_from`, `statusLabel` in `timetable-format.ts`, the same words
  everywhere). « Changements aujourd’hui » no longer lists it on both days: only on the day it moved to
  (`changeDay` in `planner.ts`), with « Déplacée. Avant : Mar. 3 nov., 8 h 00 – 9 h 00 » (`PlannerChangeDto.movedFrom`).

## Still to decide
- Can the Planificateur also edit subjects and classes, or only time and place?
- Does « Étude surveillée » count as an absence-free session for attendance (no roll call by the absent teacher)?
- Should parents' letters about report cards change now that the student page shows « Bulletin publié »?
