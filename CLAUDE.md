# CDLS: Collège de la Salle (Daher, Cairo)

School website and platform for one school. npm workspaces: `apps/web` (Angular 22), `apps/api` (NestJS 12 + Prisma 7 +
PostgreSQL 18), `packages/shared` (`@cdls/shared`: the API contract in `src/api.ts` and the pure logic). Roles: admin
(plus the « Planificateur » permission on teacher or admin accounts), teacher, student. No parent space. Read `apps/web/CLAUDE.md` and `apps/api/CLAUDE.md` for
the details of each side.

## Skills: load these first, every agent, every task

| Part of the work | Skills |
|---|---|
| API, database schema, migrations, Prisma | `nestjs-best-practices` |
| Web UI | `angular-developer`, `frontend-design` |
| Any screen you add or change | `design:accessibility-review` (Axe at 390 and 1440 px), `design:ux-copy` for words |
| Auth, permissions, tokens, anything public | `/security-review` |
| Before you hand work back | `/code-review` |

Put the skill line at the top of every brief you give an agent. The logo and crest are final: never change or fetch one.

## School packs (one install per school)

The platform is not multi-tenant: each school gets its own deployment and database. Everything that makes a school
itself is a **school pack**, `schools/<id>/` (`docs/new-school.md`): `profile.json` (the `SchoolProfile` type and
validator in `packages/shared/src/school-profile.ts`), `site/` (public text per language, photos, `SITE` config) and
`public/` (crest, icons, images). `SCHOOL` picks it: the API reads it at start (`env.validation.ts`, unknown pack refuses
to boot; `activeSchool()` in `apps/api/src/school/`), the web build wires it in with `apps/web/scripts/select-school.mjs`
(generated, gitignored files in `src/app/school/active/`, `src/app/core/school/profile.generated.ts`, `src/generated/`),
the Docker web image takes it as a build arg. Default `cdls-daher`; `schools/example` is a fictional second school.

- Never write a school's name, address, phone, e-mail, domain, time zone or section name in code: read `PROFILE`
  (`core/school/school-profile.ts`) in the web, the injected `SCHOOL_PROFILE` or `activeSchool()` in the API.
  `schoolToday()`/`schoolTimeNow()` take the profile's zone (`dayInZone`/`timeInZone` in `@cdls/shared` stay pure and take
  the zone as an argument). Section names come from `SECTION_LABELS` (web) / `sectionLabels(profile)`; the section codes
  `nationale` and `bac` are still fixed (docs/new-school.md says what making them free would take).
- Spec expectations that depend on the school (Cairo time, `Bac français`) read the profile or `it.skipIf` another zone.
- A pack is checked by `apps/web/src/app/school/pack.spec.ts`, `SCHOOL=<id> npm run e2e:smoke -w @cdls/web` (every public
  page, Axe at 390 and 1440 px) and the API's `school-profile.spec.ts`. CI-less: run both packs before a merge:
  `SCHOOL=example npm run build` and `npm run build`.

## Type safety (not optional)

- Contract first: a new endpoint starts as request/response interfaces in `packages/shared/src/api.ts`; the API DTO
  classes `implements` them and the web client imports them, so a change breaks the build on both sides.
- Strict TypeScript, no `any` (use `unknown` and narrow). String unions come with an exported const array, never a
  hand-copied list. Typed Prisma `select`/`include`, mapped to DTOs; never return a Prisma model.
- Database: changes only through new migrations (never edit an applied one); constraints Prisma cannot express
  (CHECK, partial unique, exclusion) go in the migration SQL; index every foreign key and filter.
- Pure logic lives in `packages/shared` or decorator-free files, with a spec next to it.

## How agents work here

- One feature per agent, in its own worktree and branch from `main`. Commit on the branch; never push, never touch
  secrets, never use `prisma migrate reset`. The owner decides merges.
- Each agent uses its own database and ports. The main checkout owns the embedded dev database `cdls_dev` on port 5433 (`npm run db:dev`) and ports 3000 (API) and 4300 (web).
- Done means: `npm run build`, `npm run lint` (0 warnings), `npm test`, `npm run test:e2e`, and for UI the Playwright +
  Axe specs, all green, plus README/docs updated. Report what was verified and what is left.
- A correction from the owner or a review goes into the right `CLAUDE.md` so the next agent follows it.

## Status (2026-11-20)

- **Clean-up (2026-11-20):** only `main` is left (worktrees and merged branches removed, the dead `origin` remote dropped; `college` over SSH as Mohamed-Khalil67 is the only remote). The full audit and test plan is `docs/qa/full-audit-plan.md`.
- **Security hardening (merged):** owner-only, optionally `age`-encrypted backups (`BACKUP_AGE_RECIPIENT`), images pinned to `tag@sha256`, `no-new-privileges` on every service, a vite override, `.github/dependabot.yml`.
- **Backend reliability (merged):** the e2e suite pins the school's clock (`common/clock.ts`, 2026-10-04) so it no longer fails on the real date; one global exception filter gives every error `{ statusCode, message, code? }`; structured JSON log with request id and school id (`LOG_LEVEL`); `/api/health` reports version and last migration; the password-reset mail goes through a durable outbox (new migration `20261119080945`) with retries and no stored token; shutdown waits for background work; session-change notices are batched. Details in `apps/api/CLAUDE.md`.

- **Audit fixes and school packs are merged on `main`** (audit 2026-11-18: per-account rate limits, forgot-password timing, health check, `posts.subject_id` index, no `!` in web code; backend and security reviews: no blocker, first-week items are encrypted backups, pinned images, a Clock for date-dependent e2e, one exception filter, JSON logs, password-reset mail through the outbox).
- **School packs:** the school is a pack in `schools/<id>/` selected by `SCHOOL`;
  `cdls-daher` holds everything the site had (the prerendered text and images are unchanged, the crest sprite is now
  `/crest.svg`), `example` is a fictional school. Time zone, names in mails, PDF and calendar files, and section names come
  from the profile; section codes are still the two fixed ones. See `docs/new-school.md`.

## Status (2026-11-13)

Everything below is merged on `main`. The 7 open Dependabot PRs on GitHub (#1–#7) predate the rebuild and are obsolete: workflow and Firebase bumps target files that no longer exist, TypeScript 7 is outside Angular 22's `>=6.0 <6.1` peer range, and `@types/node` stays on ^22 to match the Node 22 runtime.

- **Done:** public site in fr/en/ar with accessibility statement; login, first sign-in password change, forgotten
  password by e-mail; student, teacher and admin spaces; timetable with hard/soft conflicts and suggestions; groups and
  « Assigner à »; grades, attendance, report cards (PDF); announcements and contact messages with clean-up; roster
  import with numbered homonym e-mails; section-change approvals; next-year rollover; personal calendar feed and
  notifications; Docker deployment (`deploy/`, `docs/deployment.md`).
- **Checks on main (2026-11-13, merged redesign):** 153 shared, 331 API and 341 web unit tests; 381 of 385 API e2e (3 date-dependent: `timetable` x2, `calendar-feed` x1, until 2027-01-02; plus `password-reset`, which needs `PUBLIC_WEB_URL=http://localhost:4200`); Playwright 148 passed, 105 phone variants skipped, 3 flakes that passed alone (English contact form hydration race, roster import, visitor message; fixed on `fix/contact-form-hydration`: the prerendered send button is disabled until hydration, and the roster flake was the 10 a minute import throttle, now `IMPORT_THROTTLE_LIMIT`). `npm audit --omit=dev`: 0 vulnerabilities.
- **No CI yet:** nothing runs the checks on push; run them by hand before every merge.
- **Open:** the real login e-mail domain (`SCHOOL_EMAIL_DOMAIN`), SMTP details, a Cloudflare tunnel token or domain for
  going live, the school's review of the machine-drafted English and Arabic text, legacy weekly events not converted to
  timetable slots, school-scale testing (600 students), an independent RGAA audit.
- Diagrams (system, web layers, database groups, school year): `docs/architecture-map.html`; where things live: `docs/architecture.md`.
- **One page per role (built):** student `/eleve`, teacher `/enseignant`, planner `/admin/planification` (with « Professeur absent » and « Ajouter un examen », also for admin-only planners), admin `/admin` (« Préparer les bulletins », « Relancer »), « Noter » quick grading, the Planificateur permission and the nav clean-up (`docs/workflow-redesign.md`). The teacher page reads `GET /teacher/summary` (one request; « Appel fait », repeated absences, Cairo announcement dates). The contact form is disabled until hydrated. `apps/web/e2e/design-conformance.spec.ts` checks the built pages against the agreed design. Open: « Générer les bulletins » from the preparation page, a visible « Abs » control in « Noter ».
- More detail: `docs/school-year-design.md` (design, decisions, leftovers), `docs/deployment.md`, `docs/i18n.md`,
  `docs/accessibility.md`, `docs/calendar-feed-notifications.md`.

## TypeScript

- Strict type checking; prefer inference when the type is obvious.

## Angular

- Standalone components only; do NOT set `standalone: true` (default). Do NOT set `changeDetection: OnPush` (default
  in v22). Zoneless.
- Signals for state; `computed()` for derived state; `linkedSignal()` when state derives from several sources and must
  stay in sync; never `mutate`, use `update`/`set`.
- `input()`, `output()`, `model()` instead of decorators. No `@HostBinding`/`@HostListener`: use the `host` object.
- Lazy-load feature routes. `NgOptimizedImage` for static images (not for inline base64).
- Native control flow (`@if`, `@for`, `@switch`); `class` and `style` bindings, never `ngClass`/`ngStyle`; no
  `CommonModule` import; async pipe for observables; keep templates simple. Do not assume globals such as `new Date()`
  are available in code that also runs on the server.
- Forms: Signal Forms (`@angular/forms/signals`) for new forms; otherwise Reactive forms.
- Services: `inject()`, `providedIn: 'root'` or the `@Service` decorator (v22+), one responsibility each.
- External templates and styles use paths relative to the component file; inline templates for small components.

## Accessibility

- Must pass all Axe checks and WCAG AA: focus management, contrast, ARIA, keyboard.
