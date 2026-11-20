# Full clean-up, audit and test plan (draft for review, 2026-11-20)

Scope: the whole platform on `main` (20d1b34, level with `college/main`): 39 web routes, 138 API endpoints in 29
controllers, 34 database models, 24 migrations, 2 school packs, Docker deployment. Goal: every workflow of every role
tested end to end in a real browser with Chrome DevTools, the database checked against the schema and the rules, and
the backend and frontend checked against the project rules. Nothing below has run yet.

Built from common QA practice: smoke first, then critical journeys, P0/P1/P2 priorities, data on screen checked
against the database, keyboard and performance as release gates, a tested restore (sources at the end).

## Phase 0. Clean-up (needs your yes, it deletes things)

| Item | Now | Action |
|---|---|---|
| Agent worktrees | 12 in `.claude/worktrees/` (12 GB on disk), all clean, all merged into `main` (3 locked) | unlock, `git worktree remove` each, `git worktree prune`; this also deletes their gitignored `.env`, `.dev-db` data and test credentials |
| Local branches | 25 (12 `worktree-agent-*` + 13 feature/fix/test branches), all merged into `main` | `git branch -d` each (safe delete refuses anything unmerged); keep `main` only |
| Remote `origin` | points at `Mohamed-Khalil67/Exam-interface`, which no longer exists | `git remote remove origin`; `college` (SSH as Mohamed-Khalil67) stays the only remote |
| Dependabot PRs | #8 nginx 1.30.6 → 1.31.7, #9 35 minor/patch updates, #10 vitest 4 → 5 (major) | test each on a branch with the full checks; merge #8 and #9 if green, hold #10 unless the whole suite passes |
| Stray dev databases | 3 `dev-db.mjs` processes still running from earlier agents | stop them |
| `apps/api/.env` | points at `cdls_dev` on port 5433 since the last e2e run | point it back at `cdls_main` (or tell me which database the main checkout should use) |
| `.claude/launch.json` | uncommitted `api` and `web` entries | commit or drop: your call |
| `CLAUDE.md` Status | says `fix/backend-reliability` is "not merged" | correct it |
| Branch | stay on `main` for the whole plan; fixes found later go on short branches, merged back the same day | |

## Phase 1. Tools

Already here:
- **Claude in Chrome** (your Chrome): navigate, click, forms, console messages, network requests, JavaScript, screenshots, GIF recordings. The main driver for the workflow walkthroughs.
- **Built-in browser pane**: local pages, console, network, viewport and dark mode emulation.
- **Playwright + Axe** in the repo (22 specs, Axe at 390 and 1440 px), **API e2e** (36 files, real Postgres).
- **Skills**: `securitymaxxing` (audit, authz, injection, redteam, ship-check, harden), `nestjs-best-practices`, `angular-developer`, `frontend-design`, `code-review`, `security-review`.
- **MCP**: `prisma` (migrate status), `angular-cli` (best practices, build targets).

To add (recommended):
1. **Chrome DevTools MCP** (Google): performance traces with Core Web Vitals (LCP, CLS, INP), Lighthouse audits (accessibility, best practices, SEO), console with source maps, network detail. `claude mcp add chrome-devtools -- npx chrome-devtools-mcp@<pinned version>`. Runs its own Chrome profile, not yours.
2. **Design** plugin (Anthropic): gives `design:accessibility-review` and `design:ux-copy`, which `CLAUDE.md` requires for every screen but which are not installed.
3. Optional: **Axe Accessibility** (Deque MCP) for scan, fix, verify and keyboard-guided tests; **Postman** (needs sign-in via `/mcp`) to turn the API matrix into a reusable collection.

Not recommended: community QA bundles with broad privileges (Snagly, Agent Protocols); they overlap what is above.

## Phase 2. Automated baseline (P0, about 1 hour)

On `main`, with a fresh seeded database, in this order; any red stops the plan until fixed:
1. `npm ci`, `npm run build` and `SCHOOL=example npm run build`, `npm run lint` (0 warnings), `npm test`.
2. `npm run test:e2e` (API, 412 expected), Playwright full desktop + phone, `SCHOOL=example npm run e2e:smoke`.
3. `npm audit` (full and `--omit=dev`), `prisma migrate status`, and `prisma migrate diff` from the migrations to `schema.prisma` (no drift).
4. Docker: Docker Desktop started, `docker compose build` (including the new backup image with `age`), `up`, healthchecks, `/api/health` shows version and migration.

## Phase 3. Database (P0)

- Migrations from an empty database, and as an upgrade from the 2026-11-13 state; no drift.
- From `pg_catalog`: every foreign key has a leading index; the CHECK, EXCLUDE and partial unique constraints promised by
  the migrations exist; nullability matches the schema.
- Database user privileges (the app user owns only its schema; no superuser), connection settings, time zone, and
  sorting of French and Arabic names.
- Seed integrity: counts per table, no orphan rows, every student enrolled once per year.
- Scale: a 600-student, 60-teacher school seeded; `EXPLAIN ANALYZE` on the hot reads (teacher summary, timetable week,
  grades sheet, report preparation, rollover preview); target under 200 ms server side.
- Backup and restore drill: run the backup (plain and `age`-encrypted), restore into a separate database, check known
  records, time it.

## Phase 4. Backend (P0/P1)

- **Endpoint by role matrix:** all 138 endpoints × anonymous, student, teacher, planner, admin; expected 200, 401, 403
  or 404 written down, then checked. Includes other people's ids for every `:id` route (IDOR).
- **Input:** unknown fields refused, wrong types, empty and oversized bodies, Arabic and accented text, CSV import edge
  cases (homonyms, Arabic-only names, 1 MB limit).
- **Cross-cutting:** rate limits (login, refresh, contact, import), error shape `{statusCode, message, code}`, logs
  (JSON, request id, no e-mail or token), health, graceful shutdown with mail in flight.
- **Background work:** notification digests and password-reset mail through the outbox with a local mail catcher;
  calendar feed (.ics) in Google and Apple calendars; report-card PDF.
- **Dynamic security:** `securitymaxxing:redteam` on the local stack (token tampering, IDOR, XSS payloads in
  announcements and contact messages, CSV formula injection, CORS, cookie flags).

## Phase 5. Frontend with Chrome DevTools (P0/P1)

For each of the 39 routes, in each role that can open it, and for the public pages in fr, en and ar:
- console: 0 errors, 0 warnings from the app; network: no failed or unexpected 4xx/5xx requests, no request repeated
  in a loop;
- Lighthouse accessibility, best practices and SEO (public pages); performance trace on the public home, login and each
  role's home page (LCP under 2.5 s, CLS under 0.1, INP under 200 ms);
- phone 390 px and desktop 1440 px, Arabic right to left, keyboard only (focus visible and in order, no trap), zoom 200 %;
- slow network and offline (DevTools throttling), a blocked `/api/auth/refresh` (the "server busy" notice and
  « Réessayer », no forced sign-out), hydration of the prerendered pages (contact form disabled until ready).

## Phase 6. Every workflow, end to end (P0 first)

Each one is run in Chrome by hand-scripted steps, with the DevTools checks of Phase 5 on, and the result checked in the
database afterwards (what the screen shows is what is stored).

| Role | Workflows |
|---|---|
| Visitor | browse the public site in fr/en/ar, switch language, history and tracks pages, accessibility statement, contact form (sent, throttled, validation) |
| Everyone | sign in, wrong password, lock-out after 5 tries, first sign-in password change, forgotten password e-mail and reset, sign out, session refresh after 15 min, expired temporary password |
| Admin | create a user, import a roster CSV (preview, homonyms, « créer quand même »), disable, Planificateur permission; school years, terms, calendar days; classes, subjects and coefficients, rooms, activity types; teaching assignments; timetable editing with hard and soft conflicts and suggestions; groups and « Assigner à »; announcements; contact messages and clean-up; section-change approvals; « Préparer les bulletins » and « Relancer »; generate, edit and publish report cards (PDF); next-year rollover (preview, apply, re-run); archived year is read-only |
| Planner | planning home, « Professeur absent » (covers, late conflict), « Ajouter un examen », today's changes, moved lessons shown once |
| Teacher | home summary blocks, « Appel » (roll call), « Noter » (new grade, draft, finish later, publish), agenda events with weekly repeat, homework, groups, announcements, read-only timetable, calendar sync link, notifications |
| Student | home blocks, timetable, tick homework, grades and averages, absences, report cards (download PDF), section-change request, calendar sync, notifications |

## Phase 7. Deployment rehearsal (P1)

Docker stack with pinned images, Caddy TLS on a local name, nginx headers (CSP, HSTS, frame-ancestors) seen in
DevTools, an `age`-encrypted backup and its restore, a second school (`SCHOOL=example`) brought up from
`docs/new-school.md` as written, to prove the guide.

## Phase 8. Report and fixes

- One findings list (P0/P1/P2, steps, expected, actual, screenshot or trace, file:line when known), kept as a
  checklist page you can follow.
- Fixes: one short branch per fix group from `main`, full checks, merged back; failing workflows re-run after each fix.
- `CLAUDE.md` Status and `docs/` updated at the end; push only when you say so (SSH as Mohamed-Khalil67).

## How it would run

- Phases 0–2 first, in this session.
- Phases 3 and 4 in parallel by agents on their own databases and ports.
- Phases 5 and 6 need one browser, so they run one after the other, here.
- Rough size: about a day of work for Phases 0–4, and one to two days for Phases 5–6 at this depth.

## Sources

- [The Ultimate Web Application Testing Checklist: 2026 Guide (testomat.io)](https://testomat.io/?p=24448)
- [Web testing checklist 2026 (qaskills.sh)](https://qaskills.sh/blog/web-testing-checklist-2026)
- [Complete web application testing checklist (Guru99)](https://www.guru99.com/hu/complete-web-application-testing-checklist.html)
- [Web application testing checklist for beginners (F22 Labs)](https://www.f22labs.com/blogs/web-application-testing-checklist-for-beginners/)
- [Crafting your website QA strategy (Trackingplan)](https://www.trackingplan.com/blog/website-qa-testing)
- [Chrome DevTools (MCP) for your AI agent (Chrome for Developers)](https://developer.chrome.com/blog/chrome-devtools-mcp?hl=en)
- [Chrome DevTools MCP performance debugging (DebugBear)](https://www.debugbear.com/blog/chrome-devtools-mcp-performance-debugging)
- [Is your Postgres ready for production? (Crunchy Data)](https://www.crunchydata.com/blog/is-your-postgres-ready-for-production)
- [Prisma migrations in production (DEV Community)](https://dev.to/whoffagents/prisma-migrations-in-production-zero-downtime-strategies-and-rollback-patterns-3nf1)
