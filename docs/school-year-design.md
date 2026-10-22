# Organising the school year: design proposal

Status: **approved direction, decisions recorded below** (2026-10-20). Written 2026-10-20 from three research passes:
- similar products: Gibbon's schema, FET, aSc Timetables, WebUntis, Pronote, Google Classroom, Moodle, Microsoft SDS;
- the current code (`apps/api/prisma/schema.prisma` and the services);
- teacher and student screen patterns, with WCAG 2.2.

## Status

Updated 2026-10-22, after the third integration (branch `integration-3`: `p3-groups` and `p5-rollover` on top of `integration-2`). **Every phase is in.**

- **Phase 1, API: in.** Subjects, class subjects (the coefficient lives there), rooms, activity types (replacing the `event_kind` enum), periods with `periodId` on events, calendar days, coordinators.
- **Phase 1, admin screens: in** (`apps/web/src/app/admin/`): Matières, « Matières de la classe » (a tab of the class page, coefficient and hours edited in place, copy from another class), Salles, Types d'activité (share a teacher type with the school: admin), Année scolaire (resumable checklist and annual calendar with typed dates; closing a period: admin) and the Coordinateur toggle on the teachers list (admin). Coordinators (teachers marked coordinateur) reach the structure screens from « Coordination » in the teacher space; the other admin pages send them back to `/admin/matieres`.
- **Phase 2, timetable and conflicts: in.**
  - Model: `TimetableSlot`, `SlotException`, and the `Occupancy` index with exclusion constraints (btree_gist): `occupancy_room_no_overlap`, `occupancy_teacher_no_overlap`, `occupancy_class_whole_no_overlap`, `occupancy_class_division_no_overlap` and, from phase 3, `occupancy_group_no_overlap`. The rule (slot plus exceptions) stays the source of truth; the index rows are rewritten in the same transaction as every change, and by calendar days (holidays) and one-off events.
  - Engine in `@cdls/shared` (`timetable.ts`): week A/B counted from the school year's first week, holidays and days without classes per class or section, exceptions, « avant / maintenant ».
  - API: `/timetable` (slots, exceptions, `check`, `free-rooms`, `occurrences`, `warnings`). Hard conflicts answer 409 `TIMETABLE_CONFLICT`; warnings need `acknowledgedWarnings` with a reason, written to the audit log (409 `WARNINGS_NOT_ACKNOWLEDGED` otherwise).
  - Screens: admin week editor (ARIA grid, « Déplacer… », « Conflits (n) » panel), teacher « Mon emploi du temps », student week (the old events calendar of the student moved to `/eleve/agenda`, « Examens et devoirs »).
  - Decisions taken while building: a teacher only uses « Cette séance » (cancel, move, room) for their own sessions; « Toute la série » edits from today on (it splits the series at today once it has started, so past sessions are never rewritten); the TP-outside-a-lab warning applies to the system TP type only; one-off events with a room or a class and a time hold the room and the class (hard conflict with a lesson); a timed event for exactly ONE group holds only that group's division of the class (below).
- **Phase 3, groups and « Assigner à »: in** (see « Phase 3: groups and targets » below).
- **Phase 4: in.** Roster import with generated e-mails (homonyms numbered), first sign-in password change, section-change requests and their approval, graduation and archived accounts.
- **Phase 5, next year (rollover): in** (see « Phase 5: next year » below), including the groups step that plugs into phase 3.
- **Review fixes (branch `review-fixes`):** coefficients frozen with the period, audit trail of account changes, database trigger for every-section/section period overlaps, per-account sign-in throttle and 14-day temporary passwords, « déjà présent » detection in imports, soft-close of enrolments, bounded and filtered `GET /calendar-days`.

### Known leftovers (what is really still open)

- **Legacy weekly events are not converted to timetable slots.** The seed's two `cours` events per class (and anything created the same way before phase 2) still work in the calendar, attendance and the .ics export, but are not in the occupancy index, so they never clash, and the rollover does not copy them (they stay in the old year). Convert them by hand, then delete them.
- **Not tested at school scale.** The rollover was checked on the demo school (60 students, 8 classes, 120 slots: apply 1.5 s) and on small fixtures; a 600-student roster (the people table of the wizard is paged by 25, the plan runs in one transaction) and thousands of slots have not been tried. The slots are now placed in a handful of queries, but the plan still loads the whole year in memory.
- **A timed event for several groups holds the whole class** in the index (it holds a division only when it is for exactly one group: the index keeps one group per row, and two groups of a division could otherwise be double-booked unseen). A test for students named one by one holds the whole class too.
- **The rollover's `leavesOn` and the year's `PATCH` dates are free dates** (not checked against the calendar).
- **Moved group sessions are copied again by a re-run:** slots are matched on their rule (class subject, teacher, group, weekday, times, week), as the class-wide ones; a copied session a teacher then moved in the new year is not recognised and its original is created once more.
- The Playwright suite needs `LOGIN_THROTTLE_LIMIT` and `THROTTLE_LIMIT` raised in `apps/api/.env` (see the README).

### Integration notes (`integration-3`)

- **Migrations** (empty database, and upgrade from `20261022000100_temporary_password_expiry`, both checked with `prisma migrate deploy` and a `prisma migrate diff` against `schema.prisma`: no drift, no reconciling migration needed): `20261020033355_init` … `20261021000500_calendar_days` (auth, contact, accounts and sections, subjects, rooms, activity types, periods, calendar days) → `20261021055918_timetable` → `20261022000000_periods_all_sections_overlap` → `20261022000100_temporary_password_expiry` → `20261022000200_groups_targets` (phase 3) → `20261023000000_rollover` (phase 5, `school_years.archived_at`, `school_classes.next_class_id`). The two new ones touch different tables.
- **Merge resolutions:** attendance, events and grades keep both phase 5's `assertClassWritable` (archived years) and phase 3's `TargetsService` and `FOR UPDATE` on the event; report cards keep phase 5's enrolment stints (a student who changed class or section) and add phase 3's `wasTargeted` filter (a group's test is not in the others' average); `archiveStudentRows` (graduation, leaving, shared by `POST /users/archive` and the rollover) also closes the group memberships; the shared index exports both modules.
- **Archived years:** group writes (create, rename, delete, add or remove a member) and the « Assigner à » of an event answer 409 `YEAR_ARCHIVED` like the rest (`assertClassWritable` inside each transaction; the target is written by `EventsService`, which already guards its class).
- **Navigation** (one model, `apps/web/src/app/layout/space-navs.ts`; `layout/space-nav.spec.ts` and `e2e/all-screens.spec.ts` record it). Phone bottom bar, five items at most, « Plus » (`/<espace>/menu`, one shared page listing every screen of the space) last:
  - student: Accueil, Horaire, Devoirs, Notes, Plus (Agenda « Examens et devoirs », Absences, Bulletins in Plus);
  - teacher (a coordinator too): Classes, Horaire, Notes, Appel, Plus (Agenda, **Groupes**, Annonces and, for a coordinator, Coordination in Plus);
  - admin: Utilisateurs, Classes, Horaire, Année, Plus (Matières, **Groupes**, Salles, Types, **Nouvelle année**, Affectations, Validations, Bulletins, Messages in Plus);
  - coordinator in the administration: Classes, Horaire, Année, Plus (Matières, **Groupes**, Salles, Types, Mon espace enseignant; « Nouvelle année » is the admin's alone).
  On wide screens the top bar shows everything up to eight entries; the admin has more, so Groupes, Salles, Types d'activité, Nouvelle année and Messages move behind « Plus ».
- The first session of a new timetable series is next week when the series is made on a Wednesday: the Playwright flows look at next week.
- Deleting a room, a subject of a class or a class that timetable sessions use answers 409 (restrict foreign keys). Periods are written only through `PeriodsService` (advisory lock per year); the rollover takes the same lock.

## Phase 5: next year (rollover)

- **Model:** `school_years.archived_at` (an archived year is never current: CHECK) and `school_classes.next_class_id` (the class of the next level, same year; null = terminal, its students graduate; migration `20261023000000_rollover` backfills it from the levels of `CLASSES`, the seed sets it, `PATCH /classes/:id` edits it, admin only, with a loop check). The year DTO has `status: upcoming | current | archived`.
- **API (admin only):** `POST /rollover/preview` and `POST /rollover/apply` (`apps/api/src/rollover/`). `plan.ts` is a pure function from a snapshot of the database and the request to the plan; the service runs that plan in ONE transaction. A preview rolls the transaction back (it writes nothing, and reports exactly what an apply would do, timetable clashes included); an apply commits it. Both return/compare a SHA-256 `planHash` over the plan and its report: an apply whose hash differs answers 409 `ROLLOVER_PREVIEW_STALE` and writes nothing. Only an apply takes the locks (a global advisory lock and the source year row).
- **Steps:** new year (dates one year on, 29 February to 28 February, editable) → classes with their links → periods and calendar days shifted by the whole years between the two starts and held inside the new year (holidays and « pas de cours » are flagged to check, moveable feasts) → class subjects with coefficients (archived subjects left out) → teaching assignments (toggle) → timetable of the whole class (toggle, needs the assignments): the series in force at the end of the year runs for the whole new year, all new slots go through the occupancy index and the conflict check at once (`slot-placement.ts`: a handful of queries whatever their number), a clash leaves that slot out and is reported → students: promoted through `nextClassId` (new enrolment on the first day), `repeat` (same level), `leave` and `graduate` (`archiveStudentRows`: account archived, `graduatedOn`, enrolments and group memberships closed on `leavesOn`, default the year's end), `section_change` (promoted, and a pending request is opened) → **groups step** (below) → the old year archived, and the new one made current when the source was. Source enrolments of promoted students stay open as the old year's history.
- **Groups step** (`rollover/groups-rollover-step.ts`, registered through `ROLLOVER_EXTRA_STEPS`; the pure rules are in `groups-copy.ts`), following the group contract of phase 3:
  - each `Group` (division, label) of a copied class is created on its copy, **empty** (matched on class, division and label);
  - memberships only for **promoted** students (those whose new class is not the copy of the class they were in): a student who was in « LV2 / Allemand » of their old class gets one open membership (`joinedOn` = their new enrolment day) in the group of the same division and label of their NEW class, if it has one, and never a second one in a division. A student who repeats the year, who graduated or who left gets none (the teachers refill the groups), and any membership the new year's classes already hold, closed ones too, is respected (a second run does not put back a student a teacher took out);
  - the sessions of groups (`TimetableSlot.groupId`) are copied when the timetable is, with the new group, its division, the whole new year; the same checks as the other slots (subject copied, teacher assigned, room active, type usable), then `placeNewSlots` (`OccupancyService`) rebuilds `group_id` and `division_key`; the plain slots are copied by the timetable step (`groupId` null), so each slot is copied once;
  - `AssessmentTarget` is never copied (events are not); the old groups and memberships stay as history;
  - **previewable** (the step runs in the preview's transaction, rolled back), **idempotent** (a second run creates nothing), reported as three lines (« Groupes des classes », « Élèves promus dans leur groupe », « Séances par groupe », with created / already there / left out) in the preview, the result and the `rollover.apply` audit row, plus a `rollover.groups` audit row with the counts, and warnings or conflicts in the issues list.
- **Re-runs:** every step matches natural keys (year label, section and class code, class subject, assignment, slot rule, period kind/number, calendar day, group, membership), so a second run creates nothing; a year that already exists keeps its dates.
- **Audit:** `school_year.create`, `class.create`, `student.promote|repeat|graduated|left`, `section_change.create`, `school_year.archive`, `school_year.make_current`, `rollover.groups` and one `rollover.apply` row with the counts.
- **Read-only archived year:** grades, attendance, events (and their « Assigner à »), timetable, enrolments, groups and their members, class subjects, teaching assignments, periods, calendar days, the year's dates and `PATCH /classes/:id` answer 409 `YEAR_ARCHIVED` (`school-years/year-guard.ts`, a SHARE lock on the year row against the exclusive one of the archive). The web shows « Année archivée » on the school-year page and the class page.
- **Section-change report-card gap: fixed.** A card is built from the enrolments overlapping the period and belongs to the class the student ended it in; the grades of the earlier classes of the same stretch count (another section has its own periods, so they are told apart by date), and each subject is weighed by the coefficient of the class its grades belong to (`report-cards/compute.ts`, `subjectsOfStudent`), and only graded work the student was targeted for counts.
- **Web:** « Nouvelle année » (`apps/web/src/app/admin/nouvelle-annee/`, admin only, behind « Plus » in the top bar): five steps, resumable from the browser tab, a paginated (25 rows) student table with search, filters, bulk actions and « Tous promus », a confirmation that says what the groups do, a result with links to the new classes.

## Phase 3: groups and targets

**Model** (migration `20261022000200_groups_targets`, applies after `20261022000100`):
- `Group(id, classId, division, label, createdAt)`; unique `(classId, division, label)`; deleting the class deletes its groups; a group used by a timetable slot or an assessment target cannot be deleted (restrict, 409).
- `GroupMember(id, groupId, studentId, classId, division, joinedOn, leftOn)`; `classId` and `division` repeat the group's so that the partial unique index `group_members_open_student_division_key` (`student_id, class_id, division WHERE left_on IS NULL`) holds: **a student is in at most one group per division of a class**. Leaving sets `leftOn` (history kept).
- `AssessmentTarget(id, eventId, scope class|group|student, groupId?, studentId?)`: the TARGET is stored, never a copy of the students. No row, or one `class` row, means the whole class. Only events with a class and an activity type that is gradable or homework carry targets. The backfill gave every existing one a `class` row.
- `TimetableSlot.groupId` has its foreign key; `division` is derived from the group (a different one sent with it is refused), so phase 2 clients that only send a division still work. `Occupancy.groupId` and the constraint `occupancy_group_no_overlap`: a group is never in two places at once, while groups of one division still overlap each other.

**The target rule, in one place:** `targetedStudentIds` in `@cdls/shared` (`targets.ts`) and `TargetsService.concerned` in the API. Whole class: everyone with an open enrolment. Otherwise the union of the current members of the groups and the students named, only those still enrolled in the class. A student who joins a group later is included, one who leaves is not. The database form for lists (`concernsStudentNow`, used by `AccessService.eventAudienceFor`) is checked against the resolved list in `test/targets.e2e-spec.ts`.

**Where it applies:** grade sheets and `PUT /events/:id/grades` (a grade for a non-targeted student: 400 « n’est pas concerné(e) »; a graded student who left the group stays on the sheet, `targeted: false`, only removable), attendance sheets and saves, homework lists, ticks and completions, the students' calendar, timetable (own groups' sessions plus whole-class ones; a slot without group is whole-class) and dashboard. Editing the audience of a published piece of work never deletes a grade: taking out a student who has one is refused (409, with the names). Averages and report cards count a grade only when the student was a target (`wasTargeted`, which keeps marks earned in a group the student has since left). Leaving a class (unenrol, move, section change, graduation) closes the memberships in the same transaction (`closeGroupMemberships`).

**Permissions:** admins and coordinators manage any group; a teacher the groups of classes they teach (`AccessService.assertTeachesClass` on the group's own class, never an id sent by the caller); a student reads only `GET /groups/mine`. `GET /classes/:id/students` is also open to coordinators.

**Group contract for the rollover (phase 5; implemented by `rollover/groups-rollover-step.ts`, see « Phase 5 »).** Copy, for each class copied to the new year:
- `Group`: `division` and `label` (the new `classId` is the copied class; `id` and `createdAt` are new). Keep the unique `(classId, division, label)`.
- `GroupMember`: do NOT copy memberships blindly. If the school wants the same split next year, create `GroupMember(groupId = new group, studentId, classId = new class, division, joinedOn = the enrolment date)` only for the students promoted into that class, and only for the groups whose label and division were copied (one open membership per student and division). The default is to copy the groups empty and let the teachers refill them; a repeating student, a graduate and a leaver get no membership.
- `TimetableSlot`: copy `groupId` mapped to the new group, `division` equal to the group's division (or the typed division when there is no group), then rebuild the occupancy rows through `OccupancyService` so `group_id` and `division_key` are written.
- `AssessmentTarget`: never copied (events are not copied).
- Archive: old groups and memberships stay as history; nothing is deleted.

## What the owner asked for

1. Everyone who plans can edit the year's periods (trimesters or semesters, holidays, exam weeks) easily.
2. Activity types: cours, TD, TP, and types a teacher invents, all in one calendar.
3. Classes, and the subjects (matières) of each class, easy to manage.
4. Several calendars that never clash on a room (salle), a teacher or a class.
5. Homework and grades assigned to a whole class, a group, or individual students.
6. A section (Bac nationale or Bac français) chosen when the account is created; switching section only with the owner's (admin's) approval.
7. One school year holds its students, teachers and calendars, and next year starts from a copy.

## What blocks this today

| Need | Today | Problem |
|---|---|---|
| Periods | `Term` (number 1 to 4, dates); no edit endpoint | Can't edit; no holidays or exam weeks; weekly events run through holidays; terms are found by date, so editing dates would silently move grades between terms |
| Types | Postgres enum `event_kind` (9 values) mirrored in `@cdls/shared` | Every new type needs a migration and code changes; literals like `'devoir'` are scattered in the code |
| Subjects of a class | Coefficient sits on `TeachingAssignment`; subjects come from a list in code | A class "has" a subject only through a teacher; a co-taught subject takes the highest coefficient; no subject can be created from the admin |
| Rooms | `place` is free text | No rooms at all, so no conflict check for rooms, teachers or classes |
| Targeting | Audience is the whole school, a section or a class; grades use the full roster | No groups, no individual students |
| Section | Taken from the class enrolment; accounts are created by the admin only | No section on the student; no sign-up; no approval flow |

## Target model

What every serious product does, and what we copy: **keep the year structure, the weekly rule, one-off changes and evaluations apart**.

```
SchoolYear (label, startsOn, endsOn, status: upcoming | current | archived)
 ├─ Period (kind: trimester | semester, sectionId?, number, startsOn, endsOn, closedAt)
 │     no overlap within a section and kind (Postgres EXCLUDE on daterange)
 ├─ CalendarDay (type: holiday | exam_week | no_classes | event_day, label, startsOn, endsOn,
 │               sectionId?, classIds[]?)          ← holidays and exam weeks, optionally per section or class
 ├─ SchoolClass (sectionId, code, label, nextClassId?)   ← nextClassId drives next year's promotion
 │   ├─ Group (division, label)                    ← e.g. division "LV2": Allemand, Espagnol; "TP": A, B
 │   │   └─ GroupMember (studentId)                  groups of the same division never run at the same time
 │   ├─ ClassSubject (subjectId, coefficient, hoursPerWeek)   ← the coefficient lives HERE now
 │   │   └─ TeachingAssignment (teacherId, groupId?)
 │   └─ Enrollment (studentId, enrolledOn, leftOn)
 ├─ TimetableSlot (classSubjectId, groupId?, teacherId, roomId, activityTypeId,
 │                 weekday, startTime, endTime, validFrom, validTo, weekParity?: A | B)
 │   └─ SlotException (date, kind: cancelled | moved | substitute | room_change,
 │                     newDate?, newStart?, newEnd?, newRoomId?, newTeacherId?, reason)
 └─ Event (one-off: meeting, outing, exam session; roomId?, activityTypeId, audience)

Subject (name, group, sections[])        ← created from the admin; seeded from today's catalogue
Room (name, capacity, kind: classroom | lab | gym | hall, active)
ActivityType (code, label, colour, icon, gradable, schedulable, isSystem, ownerTeacherId?)
     system types: cours, TD, TP, examen, contrôle, devoir; teachers may add their own

Assessment (classSubjectId, activityTypeId, periodId, title, date, dueAt?, coefficient, outOf,
            state: draft | published, publishAt?)
 ├─ AssessmentTarget (scope: class | group | student, groupId?, studentId?)
 │     the TARGET is stored, not a copy of the student list, so a student who joins later is included
 └─ Grade (studentId, score, comment)     ← the student must be in the target (checked in the service)
Homework = an Assessment of a non-gradable type with dueAt, with the same targets and "done" ticks

Student.sectionId, Student.graduatedOn?; User.status: active | disabled | archived; User.mustChangePassword
SectionChangeRequest (studentId, fromSectionId, toSectionId, reason, status, decidedBy, decidedAt)
```

### Conflicts: what is blocked and what only warns

**Blocked (hard), on every write: slot, exception, one-off event and booking alike.**
- The same room, at the same time, on the same day.
- The same teacher at the same time.
- The same class at the same time, unless the two activities are for groups of the **same division** (TP A and TP B can run in parallel).

How it is enforced: occurrences are computed in `@cdls/shared` (holidays removed) and written to an `Occupancy` table (`roomId`, `teacherId`, `classId`, `groupDivision`, time range). Postgres **exclusion constraints** on that table make a clash impossible even when two people save at the same moment. The rule (slot plus exceptions) stays the source of truth; the occupancy rows are only an index.

**Warned (soft), can be saved with a reason that is logged.**
- Lessons during an exam week.
- Room capacity smaller than the group.
- More than two assessments the same day for a class.
- More hours than `hoursPerWeek`.
- A TP outside a lab.

Keep this list short: FET's experience is that stacked soft rules make a timetable impossible.

### Editing recurring lessons

Every change to a weekly slot asks the standard question: **« Cette séance / Celle-ci et les suivantes / Toute la série »**. The default is this session only, and past sessions are never rewritten ("and following" ends the old rule and starts a new one). A cancelled or moved session stays visible on everyone's timetable, struck through, with "avant / maintenant" (the Untis and Pronote pattern).

### Periods and grades

An assessment stores its `periodId` (pre-filled from its date, and the teacher can change it). Report cards read that field instead of comparing dates. Editing a period's dates never moves existing grades, and a closed period (report cards generated) is locked.

### Accounts and sections (decided)

- **Students come from the school's list of names.** The admin imports the roster (name, section, class) at the start of each year or when a student arrives. Each student gets a **school login e-mail built from their name** (`prenom.nom@<school domain>`, accents, spaces and apostrophes removed). **Homonyms get a number**: the first Mohamed Adel is `mohamed.adel@…`, the second `mohamed.adel2@…`, the third `mohamed.adel3@…`. The number is computed against existing accounts and earlier lines of the same import, inside one transaction with a unique index on the e-mail; an existing student keeps their address when the roster is imported again, and the import preview says why a number was added. The account belongs to the student **from enrolment until graduation**: it moves to the next class every year through the rollover, and is archived (read-only, no sign-in) when the student graduates or leaves.
- **Teachers** are created the same way by the admin (one by one or CSV).
- **First sign-in:** the person signs in with a temporary password from the secretariat, must choose their own password, and sees their section and class to confirm.
- **Section:** set by the admin at import (`Student.sectionId`). Changing section only through a **request** (from the student, or entered by the secretariat) that the admin approves. Approval runs in one step: it closes the old enrolment, opens the new class, removes old group memberships, keeps the grade history and writes an audit row.
- There is no public sign-up page.

### Next year

A preview-first wizard, which can be re-run safely:
1. Copy the periods and calendar days, shifted by one year.
2. Copy the classes, subjects and coefficients.
3. Optionally copy the timetable; the conflict check runs again.
4. Promote students through `nextClassId`, with per-student overrides (redoublement, leaving).
5. Archive the old year as read-only.

## Screens

**Admin**
1. **Année scolaire:** a resumable checklist (dates, then periods, holidays and exam weeks, then sections and classes, then subjects, then timetable, then students). Each step can be done later.
2. **Calendrier annuel:** a horizontal timeline of the periods, holidays and exam weeks, edited in place, with typed date entry.
3. **Classes:** per section; each class opens on its **subjects table** (coefficient, hours, teacher, edited inline; « Copier depuis la classe… »), its groups and its students.
4. **Matières, Salles, Types d'activité:** catalogue screens. The colour of each type is contrast-checked and always paired with a label and an icon.
5. **Emploi du temps:** a week grid by class, teacher or room. Every action also works without dragging (« Déplacer… » form). Conflicts show inline and in a **Conflits (n)** panel, each with one-click fixes: free rooms, move, cancel.
6. **Validations:** section-change requests, with approve or reject.
7. **Nouvelle année:** the rollover wizard.

**Teacher**
1. **Aujourd'hui:** today's sessions with any changes, plus work waiting to be graded.
2. **Mon emploi du temps:** week view; edit or cancel a session with the three-scope question; free rooms are suggested.
3. **Nouveau travail:** one form for homework or an evaluation, with type, date, period and **Assigner à** (whole class by default, then groups or students, as chips).
4. **Groupes:** saved groups per class, reusable for the timetable and for work.
5. **Saisie des notes:** the grid shows only the targeted students.
6. **Mes types d'activité:** the teacher's own types next to the school's.

**Student (phone first)**
1. **Aujourd'hui:** today's sessions as a list, with "annulé" or "salle changée" written out; homework due soon with « Fait »; latest grades.
2. **Emploi du temps:** a day list on phones and a week table on larger screens (a read-only table, not a grid).
3. **Devoirs, Notes** (weighted averages with coefficients shown), **Bulletins**.
4. **Premier accès:** choose a password, confirm section and class; « Changer de section » sends a request to the administration.

Accessibility (WCAG 2.2 AA):
- Every drag has a click or keyboard alternative (2.5.7).
- The editable grid follows the ARIA grid pattern; read-only views are tables or lists.
- Conflicts are announced in a `role="status"` region and visible as icon plus text.
- Type colours are never the only cue (1.4.1 and 1.4.11).

## Build order (each phase ships working software)

| Phase | Content | Lanes that can run in parallel |
|---|---|---|
| 1. Foundations | `Subject` CRUD; `ClassSubject` (backfill coefficients with today's highest-coefficient rule); `Room`; `ActivityType` replacing the enum (data migration); `Period` with `periodId` on assessments; `CalendarDay`; edit endpoints | API + migrations first, then admin screens |
| 2. Timetable | `TimetableSlot` + `SlotException` + `Occupancy` with exclusion constraints; occurrence engine with holidays; three-scope edit; admin and teacher week editors; student day and week views | API engine / admin editor / student views |
| 3. Targeting | `Group`, `GroupMember`, `AssessmentTarget`; "Assigner à"; grade grid and attendance limited to the targets | API / teacher screens |
| 4. Accounts | Roster import with generated school e-mails (`prenom.nom@domain`, collisions numbered); first-sign-in password change; `SectionChangeRequest` and the Validations screen; graduation archives the account | API / web |
| 5. Next year | Rollover wizard with preview; archive | single lane |

Every phase follows the project rules:
- strict TypeScript, with contracts in `packages/shared/src/api.ts` first;
- NestJS feature modules, DTO validation and Prisma migrations with data backfills;
- Angular signals and Signal Forms;
- Axe-clean at 390 and 1440 px.

Agents load `nestjs-best-practices`, `angular-developer` and `frontend-design`, and run `/security-review` on auth and permission changes and `/code-review` before merging.

## Decisions (owner, 2026-10-20)

| Question | Decision |
|---|---|
| How accounts are created | From the school's list of names: the admin imports the roster; each student gets a name-based school e-mail kept until graduation. No public sign-up. |
| Who edits the year structure | The admin and teachers marked **coordinateur**. Other teachers manage their own lessons, work and groups. |
| Periods | **Separate per section**: each section has its own periods, holidays and exam weeks; school-wide days can apply to both. |
| Custom activity types | **Private to the teacher**; the admin can promote one to a school-wide type. |
| Logo | The current crest and wordmark are final. |

Still to confirm: the school's login e-mail domain (configured as `SCHOOL_EMAIL_DOMAIN`, demo: `demo.cdls.test`), and whether these addresses are real mailboxes or sign-in identifiers only.
