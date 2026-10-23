# Collège de la Salle — Daher

The website and school platform of Collège de la Salle, Daher, Cairo (founded 1898): the **Bac nationale**
(Egyptian programme, Thanaweya Amma) and the **Bac français**. The public pages present the college; three
signed-in spaces run the school year:

| Space | Who | What |
| --- | --- | --- |
| **Public site** | Everyone | Home, history and heritage, the two tracks with their subjects, contact |
| **Espace élève** `/eleve` | Students | Dashboard, timetable, homework (tick as done), grades with averages, absences, report cards (PDF) |
| **Espace enseignant** `/enseignant` | Teachers | Their classes, the shared calendar, grade entry with a publish step, attendance, announcements |
| **Administration** `/admin` | School staff | Accounts (one by one or roster CSV with generated school e-mails), section-change validations, graduation, classes and enrolments, teaching assignments, school years, periods and calendar days, **the next-year wizard** (« Nouvelle année »: preview, promotions, archive), subjects and the subjects of each class, rooms, activity types, report cards, messages from the contact form |

Accounts are created by the college; there is no open sign-up. Built with **Angular 22** (standalone, zoneless,
signals, Signal Forms, prerendering with hydration), **Tailwind CSS v4**, **NestJS 12**, **Prisma 7** and
**PostgreSQL 18**. The visual design (navy, antique gold, ivory; Cormorant Garamond and Inter) is documented in
[docs/brand.md](docs/brand.md) and prototyped in [design/prototypes/](design/prototypes/README.md).

## Run it

The repo is an npm-workspaces monorepo (Node 22.18+):

```
apps/web         Angular 22 site and school spaces, see apps/web/CLAUDE.md
apps/api         NestJS 12 + Prisma 7 API (PostgreSQL 18), see apps/api/CLAUDE.md
packages/shared  Framework-free domain code (@cdls/shared) used by both apps
```

```bash
npm install
npm run db:dev                           # dev PostgreSQL 18 on :5433 (own terminal; writes apps/api/.env)
npm run db:migrate                       # applies the migrations (creates the tables)
npm run db:seed                          # demo data
npm run dev                              # shared (watch) + API on :3000 + site on :4200
```

`npm run db:dev` starts a project-local PostgreSQL 18 from npm (embedded-postgres, data in
`apps/api/.dev-db/`, gitignored), so nothing has to be installed. To use the system PostgreSQL 18 instead
(Windows installer, service `postgresql-x64-18`), copy `apps/api/.env.example` to `apps/api/.env`, create
the app's role and database once, as `postgres`, with [apps/api/prisma/setup-database.sql](apps/api/prisma/setup-database.sql)
(in pgAdmin's Query Tool, or with psql as shown at the top of that file), after replacing `CHANGE_ME` with
a password of your choice, and put that password in `DATABASE_URL`; `db:dev` then leaves `.env` alone.

Open http://localhost:4200; the dev server proxies `/api` to the API. API docs: http://localhost:3000/api/docs,
health: `/api/health` (process) and `/api/health/db` (database).

Migrations: `npm run db:migrate` (`prisma migrate dev`) on a development database; `npx prisma migrate deploy`
(from `apps/api`) applies the committed ones to any other database, from empty or as an upgrade (it never resets
anything). After pulling a branch that adds migrations, run `deploy` (or `db:migrate`) and, for the demo data,
`npm run db:seed`. To run a second stack beside the first one (another worktree, say), give it its own database
(`CREATE DATABASE cdls_other`, `DATABASE_URL` in its `apps/api/.env`), its own `PORT` and `CORS_ORIGIN`, build and start
it with `npm run build -w @cdls/shared && npm run build -w @cdls/api && node apps/api/dist/main`, and serve the site with
`npx ng serve --port 4340 --proxy-config <a proxy file that points /api at that PORT>` from `apps/web`
(keep the proxy file out of git).

| Command | What it does |
| --- | --- |
| `npm run build` | Builds shared, then the API (`apps/api/dist`), then the site; the 5 content pages are prerendered into `apps/web/dist/college-website/browser` |
| `npm run lint` / `npm test` | oxlint and Vitest (unit) in every workspace |
| `npm run test:e2e` | API end-to-end tests on a throwaway database (needs `npm run db:dev` running) |
| `npm run e2e -w @cdls/web` | Browser tests (Playwright, desktop and phone, with Axe at 390 and 1440 px on every screen of every space) against the running stack (`E2E_BASE_URL` for another port); needs the seeded demo accounts, a high `THROTTLE_LIMIT` (say 100000) and `LOGIN_THROTTLE_LIMIT=1000` in `apps/api/.env` (sign-in is limited to 5 attempts a minute by default)  ; the run sends 4 contact messages, so wait a minute between runs or raise `CONTACT_THROTTLE_LIMIT` |
| `npm run db:dev` | Project-local PostgreSQL 18 on :5433 (embedded-postgres) |
| `npm run db:migrate` | `prisma migrate dev`: applies the schema to the database |
| `npm run db:seed` | Wipes and re-seeds the demo data (1 year, 6 classes, 10 teachers, 60 students); the passwords go to `apps/api/demo-credentials.local.md` (gitignored) |

## The API

`apps/api` serves `/api` (docs at http://localhost:3000/api/docs). Accounts are created by the admin (one
by one, or from a roster CSV); there is no open sign-up. Every login e-mail is `prenom.nom@<SCHOOL_EMAIL_DOMAIN>`
(accents removed, spaces and apostrophes turned into hyphens, `2`, `3`… on a collision). A new or reset account has a
temporary password and `mustChangePassword`: until the person chooses a password (`POST /auth/password`, at least 10
characters, not the e-mail) every other route answers 403 `PASSWORD_CHANGE_REQUIRED`, and the web app shows the
« Premier accès » page. Accounts are `active`, `disabled` or `archived` (graduated or left: no sign-in, read-only).
Sign-in returns a 15-minute access token (send it as
`Authorization: Bearer …`) and sets a rotating refresh token in an httpOnly cookie (`POST /api/auth/refresh`).

**Forgotten password.** `/connexion/oubli` asks for the login e-mail (`POST /auth/forgot-password`, always 204: nothing
says whether the account exists; only `active` accounts get a mail). The mail holds a single-use link
`<PUBLIC_WEB_URL>/connexion/reinitialiser?token=…`, valid `PASSWORD_RESET_TTL_MINUTES` (60); that page chooses the new
password (`POST /auth/reset-password`), which ends every session of the account. Mail goes through a transport chosen by
`MAIL_TRANSPORT`: `log` (default, development) writes each mail, link included, to the API log and to the gitignored
`apps/api/.dev-mail/`; `smtp` (required in production) uses `MAIL_FROM` and `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
`SMTP_USER`, `SMTP_PASSWORD`. See `apps/api/.env.example`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password`, `/auth/forgot-password`, `/auth/reset-password`, `GET /auth/me` |
| Admin | `/users` (CRUD, `POST /users/import/preview` then `POST /users/import?role=student|teacher` roster CSV, `POST /users/archive`, `isCoordinator`), `/section-changes` (students ask, `GET /section-changes/mine`; admins list, `/:id/approve`, `/:id/reject`), `/classes`, `/enrollments`, `/teaching-assignments`, `/periods/:id/close`, `POST /activity-types/:id/promote`; `DELETE` an empty class, an unused school year (not the current one) or a period without grades (409 otherwise) |
| Structure (admin or coordinator) | `/school-years` (create, `PATCH`), `/school-years/:id/periods` and `/periods/:id` (trimesters or semesters, per section, no overlap, closed = locked), `/calendar-days` (holidays, exam weeks, days without classes), `/subjects` (create, rename, archive), `/classes/:id/subjects` (+ `/copy`) and `/class-subjects/:id` (coefficient, hours), `/rooms` |
| Activity types | `GET/POST /activity-types`, `PATCH/DELETE /activity-types/:id`: school-wide types (cours, TD, TP, examen…) and teachers' private types, with the flags gradable / repeatable / homework |
| Timetable | `/timetable/slots` (weekly slots, admin or coordinator; `PATCH` takes the scope `this`, `following` or `all`), `/timetable/slots/:id/exceptions` and `/timetable/exceptions/:id` (cancel, move, other room, replacement; a teacher for their own sessions), `POST /timetable/check` (conflicts and warnings without saving), `/timetable/free-rooms`, `/timetable/occurrences?classId|teacherId|roomId&from&to`, `/timetable/warnings`. A clash of room, teacher or class is a 409 `TIMETABLE_CONFLICT` that names what clashed and carries up to 3 `suggestions` of each kind (a free room of a compatible kind that seats the class, and the nearest free times: for one session the same week, for a series a weekday and hours; always the periods of the year, school days, no holiday, group divisions respected); `POST /timetable/check` answers the same. The screens show them as one-click choices that save again. A warning needs `acknowledgedWarnings` with a reason (audit log) |
| Groups | `/groups?classId=` (admin, coordinator, or the teacher of the class: CRUD, `POST /groups/:id/members`, `DELETE /groups/:id/members/:studentId`; `GET /groups/mine` for a student): groups of a class by division, one group per division and student, a group with sessions or assigned work keeps its division; a timetable slot's `groupId` and an event's `target` (« Assigner à ») limit the sessions, grade sheets, attendance, homework and the student's calendar and averages |
| Calendar | `/events` (range, `/occurrences` with weekly repeats minus holidays, `/:id/ics` with EXDATE for the cancelled sessions), `/homework` (done ticks), `/posts` |
| Grades | `/events/:id/grades` (grid, save, `/publish`), `/students/:id/grades` (averages by subject) |
| Attendance | `/events/:id/attendance?date=`, `/students/:id/attendance` |
| Report cards | `/periods/:id/report-cards/generate` and `/publish`, `/students/:id/report-cards`, `/report-cards/:id/pdf` |
| Next year (admin only) | `POST /rollover/preview` (what would be created, skipped or flagged; writes nothing) and `POST /rollover/apply` (the same plan in one transaction, 409 `ROLLOVER_PREVIEW_STALE` when the data changed since the preview, the old year archived). The plan copies the classes, periods, calendar, subjects, assignments, the timetable, promotes the students and copies the groups (empty, plus the promoted students who find a group of the same name, and the sessions of groups); each step is reported as created / already there / left out. `PATCH /classes/:id` sets `nextClassId`. An archived year answers 409 `YEAR_ARCHIVED` to every write: grades, attendance, events and their « Assigner à », timetable, enrolments, groups and members, subjects, periods, calendar |

| Contact | `POST /contact` (public, `CONTACT_THROTTLE_LIMIT` messages a minute per IPv4 address or IPv6 /64, 5 by default; set `TRUST_PROXY` to the number of reverse proxies when deployed behind one), `GET /contact-messages`, `PATCH` and `DELETE /contact-messages/:id`, `POST /contact-messages/handle` (up to 100 at once) (admins, audited); handled messages are deleted `CONTACT_RETENTION_DAYS` (365) days after handling, checked daily |

Who may do what mirrors the old Firestore rules (`docs/legacy/firestore.rules`): students only see their own records and what is addressed
to their class, section or the whole school; teachers only grade, take attendance and post for the classes
and subjects they are assigned; admins manage everything. The request and response types are in
`packages/shared/src/api.ts` for the web app to import.

## Where the content lives

Typed data in `apps/web/src/app/school/`: `school-info.ts` (name, milestones, directors, phones),
`tracks.ts` (the two track pages), `photos.ts` (26 photos: file, size, alt, credit, source) and
**the subject catalogue** (`packages/shared/src/subjects.ts`, shared with the API): one entry per
subject plus its illustration in `apps/web/public/images/matieres/` (`node scripts/subject-images.mjs`,
run from `apps/web`, regenerates the illustrations). The
catalogue is what teachers pick from when they publish or grade, and what the track pages show: trim
or extend it there. Subject illustrations are original drawings; replace them with school photos only
with the right to use them.

## Architecture

```
apps/web/src/app/
  public/        Public pages (prerendered)        auth/         /connexion
  eleve/         Student space                      enseignant/   Teacher space
  admin/         Administration                     school/       Static content of the public site
  layout/        Public layout, space layout (app bar, bottom nav)
  ui/            UI kit (cdls-*): button, field, modal, tabs, grade input, pagination…
  core/          ApiClient (every endpoint), AuthStore, interceptor, role guards
apps/web/src/styles.css   Design tokens as a Tailwind 4 theme + component classes from the prototypes
apps/api/src/             One NestJS module per area (auth, users, classes, events, grades, attendance…)
apps/api/prisma/          Schema, migrations, seed
packages/shared/src/      Domain logic and the API contract (api.ts) used by both apps
design/prototypes/        Approved HTML/CSS screens (the design source)
docs/                     brainstorm.md (roles, flows, data model), brand.md, legacy/
```

The access token lives in memory only; the refresh token is an httpOnly cookie, so a reload restores the
session. Public pages are prerendered; the spaces are client-rendered and lazy-loaded per area.

## Deployment

The whole stack (site, API, PostgreSQL 18, nightly backups, HTTPS from anywhere through a Cloudflare Tunnel or Caddy) runs
with Docker Compose from `deploy/`. Step by step for a Windows laptop or a Linux VM: [docs/deployment.md](docs/deployment.md);
backup and restore: [deploy/restore.md](deploy/restore.md).

## History of this repository

An earlier version included a timed-exam engine, a teacher CMS and roles. It is preserved under the
git tag **`archive/exam-engine-2026-10-16`**.
