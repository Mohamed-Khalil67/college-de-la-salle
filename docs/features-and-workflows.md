# Features and workflows

Everything the platform does today (`main`, 22 November 2026), written for the school, for a new developer and for
the tests. Each workflow has an id (`WF-…`): `docs/qa/workflow-test-report.md` records how each one was tested and
the result. Words the user sees are quoted in French, as on screen.

## 1. What the platform is

- A school website and an internal platform for **one school per install**: each school has its own deployment and
  database. Everything that makes a school itself (name, contacts, crest, photos, public text, time zone, sections,
  login e-mail domain, site address) is a **school pack** in `schools/<id>/`, chosen with `SCHOOL`
  (`docs/new-school.md`). `cdls-daher` is the Collège de la Salle, Daher, Cairo; `example` is a fictional school.
- **French only.** The public site and the spaces are in French (the school's decision, `docs/i18n.md`).
- Built with Angular 22 (public pages prerendered, spaces in the browser), NestJS 12 + Prisma 7 + PostgreSQL 18, and a
  shared TypeScript package for the API contract and the pure rules. Deployed with Docker Compose (`deploy/`).
- **Roles:** student, teacher, admin. The « Planificateur » permission is added on a teacher or admin account (never a
  student). There is no parent space and no public sign-up.

### Who can do what

| Role | In short |
|---|---|
| Visitor | Reads the public site, writes to the secretariat |
| Student | Own timetable, homework (tick done), grades and averages, absences, report cards (PDF), announcements for their class, section-change request, notifications, calendar link |
| Teacher | Own classes only: timetable (read-only), agenda events, homework, « Noter » and the grade grid, « Appel », groups, announcements, notifications, calendar link |
| Planner (teacher or admin with « Planificateur ») | Year structure (subjects, rooms, activity types, terms, calendar days), the timetable, every group, « Professeur absent », « Ajouter un examen » |
| Admin | Everything above, plus accounts, imports, classes and enrolments, teaching assignments, closing terms, report cards, « Préparer les bulletins », messages, announcements to the school, next-year rollover |

Every rule is enforced by the API, not only the screens: 138 routes × 5 roles were checked in the backend audit
(`docs/qa/phase4-backend.md`), and 63 attempts to read someone else's data were all refused.

## 2. Public site (visitors)

| Id | Workflow | How it works |
|---|---|---|
| WF-P01 | Browse the site | Six prerendered pages: home, « Histoire », « Bac nationale », « Bac français », « Contact », « Accessibilité ». The text and photos come from the pack. Phones get small WebP copies of the photos; the hero photo loads first. Canonical links are absolute (pack `siteUrl` or `PUBLIC_WEB_URL`); `robots.txt` keeps crawlers out of the spaces and names a `sitemap.xml` of the six pages. |
| WF-P02 | « Vous êtes… » | The home page sends a student, a teacher or a family to the right place. |
| WF-P03 | Write to the secretariat | Contact form (name, e-mail, subject, message). The send button stays disabled until the page is ready, so a message cannot be lost by an early click. 5 messages a minute per address. The admin reads it in « Messages » (WF-AD09). |
| WF-P04 | Accessibility statement | The RGAA statement (« non conforme » until an independent audit), what is tested, how to report a problem. |
| WF-P05 | Keyboard and screen readers | Skip link, phone menu closed with Escape, one `h1` per page, Axe-clean at 390 and 1440 px, WCAG AA contrast. |

## 3. Signing in and accounts

| Id | Workflow | How it works |
|---|---|---|
| WF-A01 | Sign in | `/connexion`: school e-mail (`prenom.nom@<domain>`) and password. Each role lands on its own « Accueil ». Wrong credentials: « Identifiant ou mot de passe incorrect ». 5 tries a minute per account and address. |
| WF-A02 | First sign-in | An account created or imported by the admin has a temporary password (valid 14 days). At first sign-in every page except « Premier accès » is closed: the person chooses a password; a student also confirms section and class. An expired temporary password is refused: « demandez-en un nouveau au secrétariat ». |
| WF-A03 | Stay signed in | The access token lives in memory (15 min); a refresh cookie (httpOnly, 7 days) restores the session after a reload. A busy minute (429) never signs anyone out: the app retries and says « serveur occupé » with « Réessayer ». |
| WF-A04 | Sign out | Account menu → « Se déconnecter »: the session ends on the server; opening a space then goes to `/connexion?suite=…` and back after sign-in. |
| WF-A05 | Change password | Account menu → « Changer mon mot de passe ». Every other session of the account ends at once. |
| WF-A06 | Forgotten password | `/connexion/oubli`: always the same answer whatever the identifier (no account fishing). If the account exists, an e-mail with a link valid 60 minutes, single use, is sent through a durable outbox (retried if the mail server is down). `/connexion/reinitialiser?token=…` sets the new password and ends every session. |
| WF-A07 | Calendar link survives only the right password | Changing or resetting a password, disabling or archiving an account kills its sessions and its calendar link (WF-N03). |

## 4. Student space (`/eleve`)

| Id | Workflow | How it works |
|---|---|---|
| WF-S01 | « Accueil » | Five blocks, each loading on its own (one failing block shows its own error and « Réessayer », the rest stays usable): **Maintenant** (class in progress or next, today's classes, a calm message on holidays and on Friday/Saturday), **À faire** (next homework with its tick, tests of the next two weeks), **Notes** (term average, three latest grades, « Bulletin publié »), **Absences** (term count, latest), **Annonces**. Each block ends with one button to its detail page. |
| WF-S02 | Timetable | « Emploi du temps »: the week, sessions of the class and of the student's groups, cancelled ones struck through with the reason, a moved one shown once on its new day (« Déplacée. Avant : … »), a replaced teacher written out. |
| WF-S03 | Homework | « Devoirs »: homework that concerns the student (class, group, or « Assigner à »), tick done / undo; the teacher sees the ticks. |
| WF-S04 | Exams and homework calendar | « Examens et devoirs » (agenda view of what is due). |
| WF-S05 | Grades | Published grades by subject with averages (per subject and overall, with coefficients); unpublished marks are never shown. |
| WF-S06 | Absences | Absences, late arrivals and excused absences recorded at « Appel », with day, subject and time. |
| WF-S07 | Report cards | Published report cards of each term on screen, « Imprimer », « Télécharger le PDF » (own cards only). |
| WF-S08 | Section change | From the account menu (« Ma section »): ask to change section with a reason; one pending request at a time; the admin approves or refuses (WF-AD06). |
| WF-S09 | Announcements | « Annonces »: announcements for the whole school, the student's section and class. |

## 5. Teacher space (`/enseignant`)

| Id | Workflow | How it works |
|---|---|---|
| WF-T01 | « Accueil » | One request (`GET /teacher/summary`) fills five blocks: **Mes cours aujourd'hui** (each class with « Appel », « Noter », « Devoir »; « En cours », « Terminé », « Appel fait »), **Notes à finir** (drafts, planned exams, half-entered marks « 18 / 27 », reminders from the admin), **Devoirs donnés** (with how many ticked), **À surveiller** (unfinished marks after a week, upcoming exams of their classes, students with 3+ days of unexcused absence in 30 days), **Annonces**. Header buttons « Nouvelle note » and « Saisie des notes ». |
| WF-T02 | « Mes classes » | The classes and subjects the teacher is assigned to, with their students. |
| WF-T03 | « Appel » (roll call) | For a session of their class: present, absent, late (minutes), excused, a note. Saved per occurrence; the student sees it (WF-S06). Only the class's teachers can take it. |
| WF-T04 | « Noter » (quick grading) | 1. « Quelle note ? »: a new note (name, « Sur », coefficient), a planned exam or a draft; 2. the grid: Enter goes to the next student, decimal comma works, an empty cell is an absent student (does not count), autosave with « Enregistré · 4 / 27 · moyenne 14,2 »; 3. « Finir plus tard » (stays in « Notes à finir ») or « Publier aux élèves » after a confirmation. Needs an open term covering today. |
| WF-T05 | Grade grid of an agenda event | « Saisie des notes »: the same grid for an exam or test planned in the agenda; only the students the work concerns are listed. |
| WF-T06 | Agenda events | « Agenda »: create, edit, delete events (course, exam, test, homework, the school's own types and the teacher's private types), with links, room, and « Chaque semaine » repeat; the room and class must be free (409 with free times offered otherwise). Changes notify the students (WF-N01). |
| WF-T07 | Homework | « Devoir » from a lesson or the agenda: due date, the class, a group or chosen students (« Assigner à »); then the ticks per student. |
| WF-T08 | Groups | « Groupes »: groups by division (e.g. « LV2 »: Allemand, Espagnol), one group per division per student (explained when refused); homework, grade grids and roll calls of a group list only its members. |
| WF-T09 | Own timetable | « Mon emploi du temps », read-only (changes are the planner's job). |
| WF-T10 | Announcements | To one class or a section they teach; a student of another class does not see it; delete their own. |
| WF-T11 | Activity types | Their own event types (colour, icon, gradable, homework, repeatable), private until the admin shares them. |

## 6. Planner (`/admin/planification`)

| Id | Workflow | How it works |
|---|---|---|
| WF-PL01 | Planner's « Accueil » | **À régler** (timetable warnings and classes missing hours), **Changements aujourd'hui** (absences covered, room changes, whether students were told), **Salles maintenant** (free rooms and until when), **L'année** (terms, exam weeks, holidays), **Emplois du temps** (classes complete or not). A teacher with the permission reaches it from « Plus » and goes back with « Mon espace enseignant ». |
| WF-PL02 | « Professeur absent » | Choose a teacher and days (14 at most); for each lesson: « Annuler », « Remplacer » (proposes a free teacher of the same subject first, never one already held at that time) or « Étude surveillée » (a supervisor and room); « Enregistrer et prévenir » saves every choice in one transaction (60 at most) and notifies the class, the absent teacher and the covering teacher. If someone was given another lesson meanwhile, the page reads the lessons again, keeps the other choices and says who is no longer free. |
| WF-PL03 | « Ajouter un examen » | Exam or test for any class: class, subject, optional title, date, times, optional room. Says whether the day is in the class's exam week and warns (without blocking) at a third assessment that day; a clash of the class or room is refused. Audited. |
| WF-PL04 | Timetable editor | Weekly grid per class, teacher or room, keyboard operable (arrows, Enter, Escape). Each change asks « Cette séance / Celle-ci et les suivantes / Toute la série »; the past is never rewritten. Hard conflicts (same room, same teacher, same class outside parallel groups of one division) are refused, also when two people save at once (database exclusion constraints), with free times and rooms offered as one-click suggestions. Soft warnings (exam week, capacity, more than two assessments a day, too many hours, TP outside a lab) need a reason, which is logged. |
| WF-PL05 | Year structure | Subjects (with their sections; archived, never deleted), class subjects (coefficient, hours a week, « Copier depuis la classe… »), rooms, activity types, terms (no overlap), holidays, exam weeks, days without classes. Coefficients freeze once a term of the section is closed. |

## 7. Administration (`/admin`)

| Id | Workflow | How it works |
|---|---|---|
| WF-AD01 | Admin's « Accueil » | Seven blocks: **À valider** (section-change requests, accounts that never chose a password), **Messages**, **Classes** (count, average size, students without a class), **Bulletins** (share of subjects ready, late teachers), **Rôles** (planners, admins), **Année scolaire**, **Annonces**; header buttons « Ajouter un compte » and « Importer une liste ». |
| WF-AD02 | Create one account | « Ajouter un compte »: student or teacher (or admin); the login e-mail is built from the name (`prenom.nom`, numbered for homonyms: `prenom.nom2`…); the temporary password is shown once. |
| WF-AD03 | Import a roster (CSV) | « Importer une liste »: preview first (generated e-mails, why a number was added, lines already present skipped, errors per line), then create all or nothing. A homonym is created only when « créer quand même » is ticked. The list of temporary passwords is downloaded once (spreadsheet formulas neutralised). 1 MB, 10 imports a minute. Names with no Latin letter need an e-mail typed by hand. |
| WF-AD04 | Accounts | « Utilisateurs »: search, filter, edit, reset a password (new temporary one), disable, restore, archive; give or take the « Planificateur » permission (audited). Accounts are never deleted. |
| WF-AD05 | Classes and enrolments | Create classes per section, enrol and unenrol students (unenrolling closes the enrolment, history kept), move a student, archive a class. |
| WF-AD06 | Section changes | « Validations »: approve (one step: closes the old enrolment, opens the new class, leaves the old groups, keeps the grades, audit row) or refuse with a reason; the secretariat can open a request for a student. |
| WF-AD07 | Teaching assignments | « Affectations »: teacher × class × subject (× group); the teacher then sees that class (WF-T02). |
| WF-AD08 | Announcements | To the whole school, a section or a class; delete any. |
| WF-AD09 | Messages | Contact-form inbox: mark handled (one or a selection), delete; old messages are cleaned up after `CONTACT_RETENTION_DAYS`. |
| WF-AD10 | « Préparer les bulletins » | Per class and term: subjects not ready (« no grades », « 18 / 27 », « not published ») and who teaches them; « Relancer » for one class or every late teacher writes a « Notes à finir » reminder (once every 12 hours per scope, open terms only, audited). |
| WF-AD11 | Close a term | « Année scolaire » → « Clôturer »: locks the term's marks (they feed the report cards) and freezes the coefficients of its section; the admin can reopen it (« Rouvrir »). |
| WF-AD12 | Report cards | « Bulletins »: for a closed term, generate the cards (all classes or one), rank and average per student, write and save an appreciation, publish (the students then see them and the PDF). Arabic text in an appreciation or a name prints correctly in the PDF. |
| WF-AD13 | Next year (rollover) | « Nouvelle année »: a wizard with a preview of everything it will create: the new year with dates moved by a year, classes and their next class, terms and calendar days, class subjects and coefficients, assignments and the timetable (optional), students promoted, repeating, graduating or leaving, groups copied empty with promoted members. Apply runs in one transaction and can be re-run safely; the old year becomes read-only (every write answers « année archivée »). Only one year can be current. |

## 8. Notifications and calendar

| Id | Workflow | How it works |
|---|---|---|
| WF-N01 | Notifications | Written in the same transaction as the change: a session cancelled, moved, re-roomed, covered, turned into a supervised study or restored; an event moved, re-roomed or cancelled; homework assigned; grades published; a reminder from the admin. Bell with the unread count, list with « Marquer comme lue », « Tout marquer comme lu », filter. The person who made the change is never told. |
| WF-N02 | Notification e-mails | Opt-in. One grouped e-mail every `NOTIFICATION_MAIL_INTERVAL_MINUTES`, never for a past session or a read notification; deleted after `NOTIFICATION_RETENTION_DAYS`. |
| WF-N03 | « Synchroniser mon agenda » | One secret `.ics` link per student or teacher for Google, Apple or Outlook: 30 days back, 180 ahead, real sessions with their exceptions, events, exams and homework that concern them, holidays; only an HMAC of the secret is stored; regenerate or revoke; dies with a password change or a disabled account. A single event can also be downloaded as `.ics`. |

## 9. Behind every workflow (cross-cutting)

| Id | What | How it works |
|---|---|---|
| WF-X01 | Permissions | Global sign-in check, role check, and ownership through one access service (a teacher only where they teach; a student only their own records and the audience of each event). |
| WF-X02 | Rate limits | Signed-in traffic counts per account, not per address, because the whole school shares one public address; sign-in, password, forgotten password, contact and import have their own limits. |
| WF-X03 | Errors | One shape everywhere, `{ statusCode, message, code?, retryable? }`, in French; a database race answers a retryable 409, never a 500 with details. |
| WF-X04 | Audit log | Sensitive changes are recorded in the same transaction (accounts, imports, permissions, section changes, grade changes, exams by planners, reminders, rollover). |
| WF-X05 | Logs and health | JSON logs with a request id and the school, never e-mails, tokens or passwords; `/api/health` gives the version and the last migration; `/api/health/db` only inside the stack. |
| WF-X06 | Time | « Today » is the school's day in its time zone; the database session is UTC. |

## 10. Operations

| Id | Workflow | How it works |
|---|---|---|
| WF-O01 | Deploy | `docs/deployment.md`: Docker Compose (database, API, web, nightly backups; Cloudflare Tunnel or Caddy for HTTPS). Images pinned by digest; the API runs as a non-superuser database login. A release web image refuses a placeholder site address. |
| WF-O02 | First administrator | `node dist/cli/create-admin.js --email … --first … --last …` on an empty database (temporary password, change forced). Never `db:seed` on real data. |
| WF-O03 | Backups and restore | One dump at start-up then nightly, owner-only files, optionally encrypted with `age`; restore steps and a monthly restore test in `deploy/restore.md`. Known issue: the start-up dump can run before the migrations (finding 26). |
| WF-O04 | A new school | Copy `schools/example`, fill `profile.json` and the French text, add the crest, set `SCHOOL`, build, deploy, create the admin, import the roster (`docs/new-school.md`). The section codes `nationale` and `bac` are still fixed. |

## 11. Not in this version

No parent space; no push notifications; series-wide timetable edits do not notify session by session; legacy weekly
events are not converted to timetable slots; no « Générer les bulletins » button on the preparation page yet; no
visible « Abs » control in « Noter » (an empty cell means absent); real login domain, mail server and site address
still to be provided by the school; an independent RGAA audit is still to do.

## Appendix: API by area

`apps/api/src/*/…controller.ts`; contract in `packages/shared/src/api.ts`; Swagger at `/api/docs` (not in production).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/refresh`, `/logout`, `/password`, `/forgot-password`, `/reset-password`; `GET /auth/me` |
| Accounts | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `POST /users/import/preview`, `/users/import`, `/users/archive` |
| Classes | `GET /sections`, `GET/POST /classes`, `GET/PATCH/DELETE /classes/:id`, `GET /classes/:id/students`, `POST /classes/:id/enrollments`, `DELETE /enrollments/:id` |
| Structure | `/subjects`, `/classes/:id/subjects` (+ `/copy`), `/class-subjects/:id`, `/rooms`, `/activity-types` (+ `/:id/promote`), `/school-years` (+ `/:id/current`), `/school-years/:id/periods`, `/periods/:id` (+ `/close`), `/calendar-days`, `/teaching-assignments` |
| Timetable | `/timetable/slots`, `/timetable/slots/:id` (+ `/exceptions`), `/timetable/exceptions/:id`, `/timetable/check`, `/timetable/occurrences`, `/timetable/warnings`, `/timetable/free-rooms` |
| Planner | `/planner/teachers`, `/planner/absence` (GET, POST), `/planner/today`, `/planner/rooms-now`, `/planner/timetables` |
| Events and homework | `/events` (+ `/occurrences`, `/:id`, `/:id/ics`), `/homework`, `/homework/:eventId/done`, `/events/:id/completions` |
| Grades and attendance | `/events/:id/grades` (+ `/publish`), `/students/:id/grades`, `/grading/assessments`, `/grading/pending`, `/events/:id/attendance`, `/students/:id/attendance` |
| Report cards | `/periods/:id/report-cards` (+ `/generate`, `/publish`), `/students/:id/report-cards`, `/report-cards/:id` (+ `/pdf`), `/periods/:id/report-preparation` (+ `/reminders`) |
| People and messages | `/groups` (+ `/mine`, `/:id`, `/:id/members`), `/section-changes` (+ `/mine`, `/:id/approve`, `/:id/reject`), `/posts`, `/contact`, `/contact-messages` (+ `/handle`, `/:id`) |
| Notifications and feed | `/notifications` (+ `/summary`, `/preferences`, `/read-all`, `/:id/read`), `/calendar/feed` (GET, POST, DELETE), `/calendar/feed/:file` (public) |
| Year change | `/rollover/preview`, `/rollover/apply` |
| Teacher home | `GET /teacher/summary` |
| Health | `GET /health`, `GET /health/db` |
