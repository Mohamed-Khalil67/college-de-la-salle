# Workflow test report

Tested on `main` at `b16da40` (22 November 2026), on a private stack: PostgreSQL 18 on port 5510 (database `cdls_wf`,
seeded with `npm run db:seed`), API on 3110, web (`ng serve` with a local, uncommitted proxy to 3110) on 4410. Every
WF id of `docs/features-and-workflows.md` is listed below. The document was not edited.

## Summary

| Result | Count |
|---|---|
| PASS | 51 |
| FAIL (behaviour differs from the document) | 0 |
| PARTIAL (covered in part, or only by a manual check, or a gap noted in the row) | 12 |
| NOT TESTED | 0 (the parts that were not run are named in the rows and in « Not tested ») |
| **Total ids** | **63** |

Ids by area: public 5, accounts 7, student 9, teacher 11, planner 5, admin 13, notifications and calendar 3,
cross-cutting 6, operations 4.

### Suite results

| Check | Command | Result |
|---|---|---|
| Build | `npm run build` | exit 0 |
| Lint | `npm run lint` | exit 0, 0 warnings |
| Unit tests | `npm test` | shared 198 / 198 (14 files); API 471 / 471 (57 files); web 385 / 385 (45 files) |
| API end-to-end | `PUBLIC_WEB_URL=http://localhost:4410 npm run test:e2e` | 431 tests, 430 passed, **1 failed** (37 files). The failure is environmental, see « Failures » F1 |
| Playwright (desktop, then phone) | `npm run e2e -w @cdls/web` | 374 runs: **216 passed, 0 failed, 158 skipped** (13.6 min). The skipped runs are the phone duplicates that the specs skip on purpose ("checked at 390 and 1440 px inside the test") |
| Public site | `npm run e2e:public -w @cdls/web` (after the build) | 16 passed |
| Deploy file | `docker compose -f deploy/compose.yaml --env-file deploy/.env.example config -q` | exit 0 (Docker itself was not started, see WF-O01) |
| Manual checks | API calls with the demo accounts, on the stack above | see the rows marked « manual » |

## Table, one row per workflow

How tested: a spec file under `apps/web/e2e` (Playwright, passed in the run above), a file under `apps/api/test`
(API end-to-end, passed unless stated), or the manual check named in the row.

### Public site

| Id | Workflow | How tested | Result | Evidence | How it works (where the document says less) |
|---|---|---|---|---|---|
| WF-P01 | Browse the site | `public-site.spec.ts` (`e2e:public`) | PASS | 16 passed on the built site | |
| WF-P02 | « Vous êtes… » | `public-site.spec.ts` (family card only), source reading for the other two | PARTIAL | The spec clicks « Futur élève ou famille » and lands on `/contact`. The two other cards, « Élève du collège » and « Enseignant », link to the login page (`apps/web/src/app/i18n/messages-base.fr.ts`, `audiences`) | The home page has three cards, not « a student, a teacher or a family »: the family card goes to the secretariat's contact page, since there is no parent space |
| WF-P03 | Write to the secretariat | `spaces.spec.ts`, `public-site.spec.ts`; manual limit check | PASS | Form disabled until hydrated (spec). Manual: six `POST /api/contact` from one address gave 400, 400, 400, 400, 400, **429**, so five a minute | |
| WF-P04 | Accessibility statement | `public-site.spec.ts` (every page links to it; its `h1`) | PASS | Spec passed | The statement text (« non conforme » until an audit) is in `schools/cdls-daher/site/messages.fr.ts`; not read on screen |
| WF-P05 | Keyboard and screen readers | `public-site.spec.ts` (Axe at 390 and 1440 px, one `h1`) | PARTIAL | Axe passed. No spec presses Escape to close the phone menu, and no screen reader was run | Escape closing the phone menu is not checked by name |

### Accounts

| Id | Workflow | How tested | Result | Evidence | How it works |
|---|---|---|---|---|---|
| WF-A01 | Sign in | `session.spec.ts`, `spaces.spec.ts`, `all-screens.spec.ts`; manual | PASS | Manual: wrong password → 401; admin, teacher and student sign in. Manual limit: attempts 1 to 5 → 401, 6 → 429 (see WF-X02) | The API answers « E-mail ou mot de passe incorrect. » (`apps/api/src/auth/auth.service.ts`); the screen shows the French text of the document (« Identifiant ou mot de passe incorrect… ») |
| WF-A02 | First sign-in | `accounts.spec.ts`, API `accounts.e2e-spec.ts` (`PASSWORD_CHANGE_REQUIRED`) | PASS | Spec passed. Default `TEMP_PASSWORD_TTL_DAYS` is 14 (`env.validation.ts`). The expired-password message « Demandez-en un nouveau au secrétariat » is in `apps/api/src/auth/auth.service.ts` | |
| WF-A03 | Stay signed in | `session.spec.ts` (reload keeps the session), API `rate-limits.e2e-spec.ts` and `auth.e2e-spec.ts` (429) | PARTIAL | Session reload passed; the 429 retry behaviour passed in the API suite. The busy-server wording differs (see M1) | The busy message on screen is « Le serveur est très sollicité et n’a pas pu rouvrir votre session… », with « Réessayer » |
| WF-A04 | Sign out | `session.spec.ts`; manual | PASS | Spec passed. Manual: `POST /api/auth/logout` → 204, the old refresh cookie then → 401 | |
| WF-A05 | Change password | `accounts.spec.ts` (password change from the account menu); API `accounts.e2e-spec.ts` | PASS | Spec passed | |
| WF-A06 | Forgotten password | `password-reset.spec.ts` (Playwright) and API `password-reset.e2e-spec.ts` | PARTIAL | Playwright passed. The API test fails for an environmental reason: it expects the link on `localhost:4200`, the stack here is on 4410 (F1). The rest of that API file passed | Link valid 60 minutes (`PASSWORD_RESET_TTL_MINUTES` = 60; the mail says « valable 1 heure ») |
| WF-A07 | Calendar link survives only the right password | API `calendar-feed.e2e-spec.ts` (the file's header says the feed stops when the password or status changes) | PASS | API file passed | |

### Student space

| Id | Workflow | How tested | Result | Evidence | How it works |
|---|---|---|---|---|---|
| WF-S01 | « Accueil » | `eleve-home.spec.ts`, `design-conformance.spec.ts` | PASS | Specs passed | |
| WF-S02 | Timetable | `timetable.spec.ts` (cancelled session shown to the student); `planner-gaps.spec.ts` (« Déplacée ») | PARTIAL | Cancellation passed. The « Déplacée. Avant : … » label is asserted in the planner's view, not by name on the student page | |
| WF-S03 | Homework | `groups.spec.ts` (« Assigner à »), `eleve-home.spec.ts` (tick); API `catalogue.e2e-spec.ts` (`PUT /homework/:id/done`) | PASS | Specs and API file passed | |
| WF-S04 | Exams and homework calendar | `eleve-home.spec.ts` and `design-conformance.spec.ts` open « Examens et devoirs »; manual `GET /api/homework` as a student → 200 | PASS | Specs passed. The route exists (`apps/web/src/app/features/eleve/eleve.routes.ts`) | |
| WF-S05 | Grades | `quick-grading.spec.ts` (student sees the mark); API `student-averages.e2e-spec.ts` | PASS | Specs passed | |
| WF-S06 | Absences | `absences.spec.ts` | PASS | Spec passed | |
| WF-S07 | Report cards | `report-cards.spec.ts` (read, PDF answers 200 `application/pdf`) | PASS | Spec passed | |
| WF-S08 | Section change | `accounts.spec.ts` (asked, approved or refused) | PASS | Spec passed | |
| WF-S09 | Announcements | `announcements.spec.ts` | PASS | Spec passed | |

### Teacher space

| Id | Workflow | How tested | Result | Evidence | How it works |
|---|---|---|---|---|---|
| WF-T01 | « Accueil » | `teacher-home.spec.ts` | PASS | Spec passed | |
| WF-T02 | « Mes classes » | `assignments.spec.ts`; manual `GET /api/teaching-assignments` as a teacher → 200, 6 assignments | PASS | Spec passed; manual check passed | `GET /api/groups/mine` is student-only (403 for a teacher); a teacher lists a class's groups with `GET /api/groups?classId=` |
| WF-T03 | « Appel » | `spaces.spec.ts` (roll call saved), `absences.spec.ts` | PASS | Specs passed | |
| WF-T04 | « Noter » | `quick-grading.spec.ts`, `design-conformance.spec.ts` | PASS | Specs passed. The explicit « Abs » control is a known gap, a `test.fail()` in `design-conformance.spec.ts` (listed in the document, section 11) | An empty cell is an absent student |
| WF-T05 | Grade grid of an agenda event | `quick-grading.spec.ts`, `groups.spec.ts` (« Saisie des notes ») | PASS | Specs passed | |
| WF-T06 | Agenda events | `agenda-weekly.spec.ts` (create, repeat, edit, delete); API `timetable-suggestions.e2e-spec.ts` | PARTIAL | Weekly agenda passed. The 409 with free times offered is covered for timetable slots, not named for agenda events | |
| WF-T07 | Homework | `groups.spec.ts` (« Assigner à » homework) | PASS | Spec passed | |
| WF-T08 | Groups | `groups.spec.ts` | PASS | Spec passed | |
| WF-T09 | Own timetable | `timetable.spec.ts` (teacher read-only); manual | PASS | Spec passed. Manual: teacher `POST /api/timetable/slots` → 403; `GET /api/timetable/occurrences` for the teacher's own id, one week → 200 | The teacher reads the timetable through `/timetable/occurrences`; `/timetable/slots` is for planners and admins |
| WF-T10 | Announcements | `announcements.spec.ts` (class audience; another class does not see it) | PASS | Spec passed | Delete of one's own announcement is not asserted by name |
| WF-T11 | Activity types | manual (teacher create, other teacher's list, delete); `spaces.spec.ts` (event types offered in the agenda) | PASS | Manual: a teacher creates a type (201); another teacher's list does not show it; the owner deletes it (204). A student's `GET /api/activity-types` → 403 | Students cannot list activity types at all; this is not in the document |

### Planner

| Id | Workflow | How tested | Result | Evidence | How it works |
|---|---|---|---|---|---|
| WF-PL01 | Planner's « Accueil » | `planner-home.spec.ts` | PASS | Spec passed | |
| WF-PL02 | « Professeur absent » | `planner-gaps.spec.ts` | PASS | Spec passed (includes the 409 and the moved lesson) | |
| WF-PL03 | « Ajouter un examen » | `planner-add-exam.spec.ts` | PASS | Spec passed | |
| WF-PL04 | Timetable editor | `timetable.spec.ts`, `timetable-conflict.spec.ts` | PASS | Specs passed | |
| WF-PL05 | Year structure | `structure.spec.ts` | PASS | Spec passed | |

### Administration

| Id | Workflow | How tested | Result | Evidence | How it works |
|---|---|---|---|---|---|
| WF-AD01 | Admin's « Accueil » | `admin-home.spec.ts` | PASS | Spec passed | |
| WF-AD02 | Create one account | `account-lifecycle.spec.ts` | PASS | Spec passed | |
| WF-AD03 | Import a roster (CSV) | `accounts.spec.ts` (roster import); manual limit | PASS | Spec passed. `IMPORT_THROTTLE_LIMIT` default 10, as the document says | The 1 MB size limit was not tried |
| WF-AD04 | Accounts | `account-lifecycle.spec.ts`, `structure.spec.ts` (planificateur) | PASS | Specs passed | |
| WF-AD05 | Classes and enrolments | `accounts.spec.ts` (archiving a class, graduation); API `enrolment-day.e2e-spec.ts` | PASS | Specs and API file passed | |
| WF-AD06 | Section changes | `accounts.spec.ts` | PASS | Spec passed | |
| WF-AD07 | Teaching assignments | `assignments.spec.ts` | PASS | Spec passed | |
| WF-AD08 | Announcements | `admin-home.spec.ts` | PASS | Spec passed | |
| WF-AD09 | Messages | `spaces.spec.ts` (handle, delete); API `cleanup.e2e-spec.ts` (retention) | PASS | Specs passed | |
| WF-AD10 | « Préparer les bulletins » | `admin-home.spec.ts`, `design-conformance.spec.ts`; API `report-preparation.e2e-spec.ts` (reminders) | PASS | Specs and API file passed | |
| WF-AD11 | Close a term | `structure.spec.ts` (closing and reopening a term) | PASS | Spec passed | |
| WF-AD12 | Report cards | `report-cards.spec.ts` | PARTIAL | Generate, write, publish, read and PDF passed. The Arabic text in the PDF is not tested: no spec prints an Arabic appreciation or name to a PDF | |
| WF-AD13 | Next year (rollover) | `rollover.spec.ts`; API `rollover.e2e-spec.ts` | PASS | Spec and API file passed | |

### Notifications and calendar

| Id | Workflow | How tested | Result | Evidence | How it works |
|---|---|---|---|---|---|
| WF-N01 | Notifications | `agenda-notifications.spec.ts` | PASS | Spec passed | |
| WF-N02 | Notification e-mails | API `notifications.e2e-spec.ts` (« is off by default, then grouped in one mail per user, never for a past day »); manual | PASS | API test passed. Manual: `GET /api/notifications/preferences` → `emailEnabled: false` | |
| WF-N03 | « Synchroniser mon agenda » | API `calendar-feed.e2e-spec.ts`; manual | PASS | API file passed. Manual: `POST /api/calendar/feed` → 201 with a URL; the `.ics` → 200 (`BEGIN:VCALENDAR`); `DELETE` → 204; the same URL → 404 | |

### Cross-cutting

| Id | Workflow | How tested | Result | Evidence | How it works |
|---|---|---|---|---|---|
| WF-X01 | Permissions | API `permissions.e2e-spec.ts`; manual | PASS | API file passed. Manual: student `GET /api/users` → 403; teacher `POST /api/timetable/slots` → 403; teacher `GET /api/groups/mine` → 403 | |
| WF-X02 | Rate limits | API `rate-limits.e2e-spec.ts`; manual with the default limits | PASS | Manual, API restarted with the defaults (`LOGIN_THROTTLE_LIMIT=5`, `THROTTLE_LIMIT=120`, `CONTACT_THROTTLE_LIMIT=5`, `IMPORT_THROTTLE_LIMIT=10`): seven wrong sign-ins → 401, 401, 401, 401, 401, **429**, 429 | |
| WF-X03 | Errors | API `review-fixes.e2e-spec.ts` (`statusCode`, `retryable`); manual | PASS | Manual: unknown route → 404 `{ statusCode, message, code: "ROUTE_NOT_FOUND" }`; bad body → 400 `{ statusCode, message[], error, code: "VALIDATION_FAILED" }` | Validation messages are a list, not one string |
| WF-X04 | Audit log | API `password-reset.e2e-spec.ts` (« audits it »; the test fails before that assertion, F1), `planner-exams.e2e-spec.ts`, `accounts.e2e-spec.ts` | PARTIAL | The audit assertions in the other API files passed; the one that checks the password-reset audit row did not run to that line | |
| WF-X05 | Logs and health | API `app.e2e-spec.ts`; manual | PASS | Manual: `GET /api/health` → 200 `{ status: "ok", version, migration }`. `GET /api/health/db` → 200 when called directly, **404 when the request carries `X-Forwarded-For`** (as the proxy sends it), as designed | The « only inside the stack » rule works on the proxy headers, not on the network |
| WF-X06 | Time | API e2e (the clock is pinned in `test/setup-env.ts`); `school-smoke.spec.ts` not run here | PASS | The API suite passed with the pinned school clock. Log line: « Serving Collège de la Salle (cdls-daher), time zone Africa/Cairo » | |

### Operations

| Id | Workflow | How tested | Result | Evidence | How it works |
|---|---|---|---|---|---|
| WF-O01 | Deploy | Static: `docs/deployment.md` exists; `compose.yaml config -q` exit 0 | PARTIAL | Files present and the compose file parses. The stack was not brought up (no `docker compose up`) | |
| WF-O02 | First administrator | Static: `apps/api/src/cli/create-admin.ts` exists | PARTIAL | Not run (needs an empty database, which this stack is not) | |
| WF-O03 | Backups and restore | Static: `deploy/restore.md`, the `backup` service in `deploy/compose.yaml` | PARTIAL | Not run. The known issue (start-up dump before migrations) is listed as open, finding 26, in `docs/qa/findings.md` | |
| WF-O04 | A new school | Static: `docs/new-school.md`, `schools/example` exist | PARTIAL | `SCHOOL=example npm run build` was not run in this pass | |

## Doc mismatches

Each entry is what the document says, what the app does, and the evidence. The document was not changed.

- **M1, WF-A03, wording of the busy message.** Document: « serveur occupé » with « Réessayer ». App: the text is
  « Le serveur est très sollicité et n’a pas pu rouvrir votre session. Elle est peut-être toujours valable : réessayez
  dans un instant. », and the button is « Réessayer ». Evidence: `apps/web/src/app/i18n/messages-base.fr.ts` (line 169);
  a search for « serveur occup » in `apps/web/src` finds nothing. Behaviour matches (the session is kept, the app retries).
- **M2, WF-P02, the three cards.** Document: « sends a student, a teacher or a family to the right place ». App: three
  cards, « Futur élève ou famille » (to the contact page), « Élève du collège » and « Enseignant » (to the login page).
  Evidence: `messages-base.fr.ts`, `audiences`. The family card goes to the contact page, consistent with « no parent space »
  but not with a login.
- **M3, WF-X05, health/db.** The document says « only inside the stack ». The behaviour is driven by proxy headers: a
  direct call without them returns 200, a call with `X-Forwarded-For` returns 404. The document is right when the proxy
  is in front (the case in deployment); it is worth saying the check is on headers, not on the network.
- **Not a mismatch, noted:** WF-A01's API message (« E-mail ou mot de passe incorrect. ») differs from the text on the
  screen, which matches the document. Students cannot list activity types (WF-T11), which the document does not say.

## Failures

**F1. API end-to-end, `apps/api/test/password-reset.e2e-spec.ts` line 75 (test "mails a link, sets the password once,
ends every session and audits it"): fails with the stack on port 4410.**
- Expected by the test: the mail contains `http://localhost:4200/connexion/reinitialiser?token=`.
- Actual: the mail contains `http://localhost:4410/connexion/reinitialiser?token=…` (the stack's `PUBLIC_WEB_URL`).
- Cause: the expectation is a hard-coded port (4200), not the app. The README and `apps/web/CLAUDE.md` expect the stack on 4200.
- Steps: start the stack with `PUBLIC_WEB_URL=http://localhost:4410`, run `PUBLIC_WEB_URL=http://localhost:4410 npm run test:e2e`,
  one test fails. The test would pass on a stack whose site is 4200; that was not tried, since 4200 is not this run's port.
- Suggested fix (for the owner, not applied here): read the expected origin from `PUBLIC_WEB_URL` in that test.

No Playwright test failed. No documented behaviour failed a manual check.

## Not tested

- Docker: the stack was not brought up; only `compose config -q` ran (WF-O01).
- WF-O02 (first administrator on an empty database), WF-O03 (restore), WF-O04 (`SCHOOL=example` build).
- WF-X04: only the audit assertions in the passing files were seen; the password-reset audit row did not run (F1).
- WF-S02 student-side « Déplacée » label, WF-T06 agenda 409 by name, WF-AD12 Arabic PDF.
- WF-P05: Escape closing the phone menu; no screen reader.
- The 1 MB roster size limit (WF-AD03). The contact-form and roster throttles were tested with their defaults only as far as the rows say.
- `school-smoke.spec.ts` (`npm run e2e:smoke`) was not run.

## Notes for whoever runs this next

- `npm run start:dev` needs `nest build` first (run `npm run build` once), and `ng serve` needs the generated
  `src/generated/brand.css` from `npm run build`. Prisma needs `prisma generate` before `prisma db seed`.
- Stopping a `start:dev` watch task does not always stop the child process. After a restart with other limits, check
  `netstat` for the old PID on the API port; a new instance that fails with EADDRINUSE leaves the old one answering.
- The API suite and the Playwright suite both expect the demo accounts on the stack; run them one after the other.

## Follow-up (22 November 2026)

Fixed on `main` in 6b7df1f: F1 (the reset-link check reads `PUBLIC_WEB_URL` from the app; the spec passes with 4200 and 4410), and the document mismatches M1, M2 and M3 plus the two access rules noted above are now in `docs/features-and-workflows.md`.
