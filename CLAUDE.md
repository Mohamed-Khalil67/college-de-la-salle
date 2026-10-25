# CDLS: Collège de la Salle (Daher, Cairo)

School website and platform for one school. npm workspaces: `apps/web` (Angular 22), `apps/api` (NestJS 12 + Prisma 7 +
PostgreSQL 18), `packages/shared` (`@cdls/shared`: the API contract in `src/api.ts` and the pure logic). Roles: admin
(plus coordinator teachers), teacher, student. No parent space. Read `apps/web/CLAUDE.md` and `apps/api/CLAUDE.md` for
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
- Each agent uses its own database and ports. `cdls_main`, ports 3000 (API) and 4300 (web) belong to the main checkout.
- Done means: `npm run build`, `npm run lint` (0 warnings), `npm test`, `npm run test:e2e`, and for UI the Playwright +
  Axe specs, all green, plus README/docs updated. Report what was verified and what is left.
- A correction from the owner or a review goes into the right `CLAUDE.md` so the next agent follows it.

## Status (2026-10-26)

Everything below is merged on local `main`; nothing is pushed to GitHub yet (`college/main` is behind).

- **Done:** public site in fr/en/ar with accessibility statement; login, first sign-in password change, forgotten
  password by e-mail; student, teacher and admin spaces; timetable with hard/soft conflicts and suggestions; groups and
  « Assigner à »; grades, attendance, report cards (PDF); announcements and contact messages with clean-up; roster
  import with numbered homonym e-mails; section-change approvals; next-year rollover; personal calendar feed and
  notifications; Docker deployment (`deploy/`, `docs/deployment.md`).
- **Checks on main:** 140 shared, 300 API and 188 web unit tests; 350 API e2e (stable over three runs); Playwright 112
  passed, 71 phone variants skipped by design.
- **Open:** the real login e-mail domain (`SCHOOL_EMAIL_DOMAIN`), SMTP details, a Cloudflare tunnel token or domain for
  going live, the school's review of the machine-drafted English and Arabic text, legacy weekly events not converted to
  timetable slots, school-scale testing (600 students), an independent RGAA audit.
- Diagrams (system, workflows, database schema, kept in sync with `schema.prisma`): `docs/architecture.md`.
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
