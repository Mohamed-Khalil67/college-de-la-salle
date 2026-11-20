# Phase 4: backend audit (API)

Run on 2026-11-20/21 against `main` 20d1b34 in worktree `agent-afb0bd68a9a5c8e95`. Own embedded PostgreSQL 18 on
port 5480 (database `cdls_apiaudit`), API on 3060, `MAIL_TRANSPORT=log`, seeded demo data. Nothing was changed in
application code, nothing committed. All processes stopped at the end. Scripts and raw output live next to this file
(`matrix.mjs`, `idor*.mjs`, `input.mjs`, `features*.mjs`, `tokens.mjs`, `limits.mjs`, `shutdown.mjs`, `prod.mjs`,
`api-run*.log`, `api-prod.log`, `matrix.md`).

## Verdict

**PASS: no P0, no P1.** Access control holds: all 138 routes answer exactly what their decorators promise, and none
of the 63 other-people's-id checks returned 2xx. Validation, the error shape, the rate limits at their real defaults,
the logs, health, the outbox and shutdown, password reset, the feed, the PDFs, rollover and archived years all behave
as documented. I found **7 P2 issues** and 7 INFO notes. The most important P2 is about time zones: a PostgreSQL
session that is not on UTC makes Prisma store every timestamp shifted by the zone offset (the dev database on a Cairo
machine is off by 2 h today).

| Priority | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 7 |
| INFO | 7 |

## 1. Role matrix (138 routes x 5 callers)

The script read every route from the 29 controllers (method, path, class- and handler-level `@Roles`,
`@StructureEditors`, `@Public`). It signed in through `/api/auth/login` with real tokens: anonymous; student
`marc.fahmy` (1re secondaire); teacher `hany.mansour`; planner `ingy.samir` (teacher with `isPlanner`); admin. Each
route was called with random UUIDs for every `:id` and `{}` as the body, so there were no side effects.

The expected result for each route came from its decorators: public routes must not answer 401 or 403; anonymous
callers get 401; a caller outside `@Roles` gets 403; a caller inside it gets the guard's pass (2xx, 400 or 404).
**Result: 0 mismatches.** The only 403s from a caller inside `@Roles` were service-level ownership refusals for an
unknown student or period (`assertCanReadStudent` / `assertTeachesClass`), which is correct.
`POST /auth/refresh` answers 401 without a cookie, as it should. The full table is at the end of this file.

Read in compact form:
- **Anonymous:** 401 on every non-public route. Public routes: `auth/login|refresh|logout|forgot-password|reset-password`,
  `contact`, `calendar/feed/:file`, `health`, `health/db`.
- **Student:** passes only the `signed-in` routes and `student` routes (`groups/mine`, `homework*`,
  `section-changes/mine`, `POST section-changes`, `calendar/feed*`). 403 everywhere else.
- **Teacher:** passes `teacher` and `admin+teacher` routes. 403 on every `admin+planner` (structure, `timetable/slots`
  list, `timetable/warnings`, `planner/*`) and `admin` route.
- **Planner:** the teacher's routes plus every `admin+planner` route. 403 on admin-only routes (`users/*`, `rollover/*`,
  `periods/:id/close`, report-card generate/publish, `contact-messages*`, `activity-types/:id/promote`,
  `school-years/:id/current`, DELETE year).
- **Admin:** passes everything except `calendar/feed*` and `groups/mine` / `homework*` / `teacher/summary` /
  `grading/*` (403: student or teacher only, as documented).

### Other people's ids (IDOR): 63 checks, 0 returned 2xx

The callers were Claire (teaches only the bac classes), Samia (teaches only French in the nationale classes),
students Marc and Jana (same class) and Omar (Terminale), and the planner Ingy. Every check below answered 403 or 404:

- Samia's private activity type, seen by Claire: hidden from `GET /activity-types`. PATCH, DELETE and using it in
  `POST /events` all gave 404. `promote` by a teacher gave 403.
- Claire on an event of 1re secondaire: `GET/PUT grades`, `publish`, `GET/PUT attendance`, `completions`, `PATCH`,
  `DELETE`. Also `POST /events` and `POST /grading/assessments` for that class, `grading/pending`,
  `classes/:id/students`, `POST /posts` with that `classId`, the period's report cards (with and without a class),
  and Marc's grades, attendance and report cards.
- The planner creating homework (not an exam) for a class and subject she does not teach: 403.
- Samia on a group of Seconde (a class she does not teach): GET, list, PATCH, add member, remove member, create,
  DELETE, all 403. Philippe's (Seconde) grades: 403.
- Same class, other subject: Samia (French in 1re secondaire) on the Arabic test: grades 403, PATCH 403.
- Marc on Jana: grades, attendance and report cards gave 403. Marc on a Terminale event: `GET`, `GET .ics` and
  `PUT homework/:id/done` gave 404. `POST /section-changes` with Omar's `studentId` gave 403. When Marc sends another
  class's `classId` to `events`, `events/occurrences` or `posts`, the API ignores it and only his own class comes back
  (checked in the response bodies).
- Claire on Samia's timetable slot: GET 403, PATCH (scope `this`) 403, exception 403. Claire deleting another
  author's post: 403.
- Report-card PDF of Marc (after publication): Marc 200, admin 200, Samia (teaches his class) 200, Claire 403,
  Jana 404, anonymous 401. Before publication, Marc gets 404. Appreciation: Claire 403, Samia 200, after publication
  409.
- Planner on admin-only actions (`rollover/preview`, `periods/:id/close`, `GET /users`, `PATCH /users/self
  {isPlanner}`): 403. The admin setting `isPlanner` on a student: 400 « Un élève ne peut pas être planificateur. »

No notification rows belonged to another user, so `POST /notifications/:id/read` with someone else's id could not be
tested. The code path filters on `userId`.

## 2. Findings

### [P2-1] Timestamps are stored shifted when the PostgreSQL session is not on UTC
- **Where:** `apps/api/src/prisma/prisma.service.ts:20` (`new PrismaPg({ connectionString })`, no session time zone);
  `apps/api/scripts/dev-db.mjs:29-38` (initdb takes the host's zone).
- **Evidence:** the dev cluster runs `SHOW timezone` = `Africa/Cairo` (inherited from Windows « Egypt Standard Time »).
  A contact message posted at real time `2026-11-20T21:52:15.108Z` was stored as `created_at = 19:52:15.112Z`
  (`21:52:15.112+02` on the Cairo session). The API read it back as `21:52:15.112Z`: Prisma's round trip looks right,
  but the value in the database is 2 h off. A raw-SQL check exposes the gap:
  `UPDATE users SET temporary_password_expires_at = now() - interval '1 minute'` and then signing in with the expired
  temporary password gave **200** (expected 401). The same account creation also stored the expiry as
  `2026-12-04T19:51Z` for a real `2026-12-04T21:51Z`.
- **Fix, verified:** I restarted the API with `DATABASE_URL=...&options=-c%20TimeZone%3DUTC`. `SHOW timezone` was then
  `UTC`, the stored `created_at` equalled the real time, and the same expiry test answered 401 « Ce mot de passe
  provisoire a expiré » for both login and refresh.
- **Impact:** production uses the `postgres:18.7` image, which defaults to UTC, so it is fine today. The issue reaches
  production as soon as someone sets `TZ`, `PGTZ` or `ALTER DATABASE ... SET timezone` (plausible for a Cairo
  school). It already affects every dev database on a machine outside UTC, any raw SQL or migration that compares with
  `now()` (for example `20261022000100_temporary_password_expiry`), backups read by other tools, and the
  `docs/legacy` / report exports done in SQL.
- **Fix:** pin the session zone in code, not in the environment:
  `new PrismaPg({ connectionString, options: '-c TimeZone=UTC' })` (or append `options=-c TimeZone=UTC` in
  `env.validation.ts`). Pass `postgresFlags: ['-c', 'timezone=UTC']` to EmbeddedPostgres in `dev-db.mjs`. Add an e2e
  that compares a row's `created_at` with `now()`. Existing dev rows stay shifted (re-seed).

### [P2-2] « Ajouter à mon agenda » (.ics of one event) is not valid RFC 5545 and uses floating times
- **Where:** `packages/shared/src/calendar.ts:477-510` (`toIcs`), served by `GET /events/:id/ics`
  (`apps/api/src/events/events.controller.ts:63-69`).
- **Evidence:** the file has `DTSTART:20261013T090000` with no TZID, no VTIMEZONE, and **no DTSTAMP**. DTSTAMP is
  required in a VEVENT, so strict parsers (and some Outlook versions) refuse the file. A phone set to another zone
  (a family travelling, or a device left on UTC) shows the exam at the wrong hour. The subscription feed does not have
  this problem: 554 student events and 196 teacher events, all with `TZID=Africa/Cairo` and a matching VTIMEZONE (Egypt
  DST rules), CRLF, 75-octet folding, unique UIDs: valid.
- **Fix:** build the single event with the feed's pieces (`packages/shared/src/feed.ts`): the profile's VTIMEZONE,
  `DTSTART;TZID=<zone>:`, and `DTSTAMP` from `updatedAt`. Same UID as in the feed.

### [P2-3] The feed's file name is the CDLS school's name, hard-coded
- **Where:** `apps/api/src/calendar-feed/calendar-feed.controller.ts:67`:
  `@Header('Content-Disposition', 'inline; filename="college-de-la-salle.ics"')`.
- **Evidence:** the response header is `inline; filename="college-de-la-salle.ics"` whatever `SCHOOL` is. This breaks
  the rule « never write a school's name in code »: the `example` pack would hand out a CDLS file name.
- **Fix:** set the header in the handler with `res.setHeader`, or return a `StreamableFile` with
  `disposition: inline; filename="<profile slug>.ics"`, using a slug of `SCHOOL_PROFILE.names` or the profile id.

### [P2-4] Some error bodies are English and the 429 has no `code`
- **Where:** `apps/api/src/app.module.ts:50-80` (ThrottlerModule with no `errorMessage`), the global `ValidationPipe`
  in `app.setup.ts:44-50`, and DTOs without French messages.
- **Evidence:**
  - Every 429 answers `{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}` (with `Retry-After: 60`):
    English, the name of a library class, and no `code`.
  - Many 400s use class-validator defaults: `"title must be a string"`, `"property authorId should not exist"`,
    `"coefficient must not be greater than 20"`, `"planHash must match /^[0-9a-f]{64}$/"`.
  - An unknown route answers `"Cannot GET /api/nope"`.
  - The French messages exist only where a DTO spells them out (contact, quick grading).
  - `PASSWORD_CHANGE_REQUIRED` arrives in `error`, not in `code`, unlike `YEAR_ARCHIVED` and `TIMETABLE_CONFLICT`.
  - The shape `{statusCode, message, code?}` itself held on every status checked: 400, 401, 403, 404, 409, 413, 429.
    No 500 could be provoked through the API: out-of-range numbers, years 0001 and 9999, huge pages, malformed and
    deep JSON were all refused or answered cleanly. P2025 is reached only through races (service code checks first,
    and the mapping is covered by the unit specs).
- **Fix:**
  - `ThrottlerModule.forRootAsync({ ..., errorMessage: 'Trop de requêtes : réessayez dans une minute.' })`, or a
    `ThrottlerGuard` subclass that throws `HttpException({ statusCode: 429, message, code: 'RATE_LIMITED' })`. Add
    `RATE_LIMITED` to the shared `ApiError` codes.
  - A `ValidationPipe` `exceptionFactory` that maps constraint names to French sentences, and a French
    `NotFoundException` for unknown routes in `AllExceptionsFilter`.
  - Move `PASSWORD_CHANGE_REQUIRED` to `code`, and keep `error` for one release so the web interceptor goes on
    working.

### [P2-5] An expired temporary password can still be changed through a session opened before it expired
- **Where:** `apps/api/src/auth/auth.service.ts:169-182` (`changePassword` never calls
  `temporaryPasswordExpired`) and `:216-231` (`userFromAccessToken` does not check it either).
- **Evidence (UTC session):** sign in with the temporary password, then the DB sets the expiry in the past. Login gave
  401 and refresh gave 401, as they should, but `GET /auth/me` with the earlier access token gave 200, and
  `POST /auth/password` with `currentPassword` = the **expired** temporary password gave **200**: a new session.
- **Impact:** the window is at most one access-token lifetime (15 min) and needs the temporary password. It goes
  against the documented rule « an expired one answers 401 ».
- **Fix:** in `changePassword`, `if (temporaryPasswordExpired(user)) throw new UnauthorizedException(EXPIRED_TEMPORARY_PASSWORD)`.
  Optionally return null from `userFromAccessToken` when `temporaryPasswordExpired(user)`.

### [P2-6] Access tokens without `exp` are accepted
- **Where:** `apps/api/src/auth/auth.module.ts:17-18` (`verifyOptions: { algorithms: ['HS256'], issuer: 'cdls-api' }`).
- **Evidence:** a token signed with the real secret but without `exp` gave 200 on `GET /users`. Rejected as they
  should be: alg `none`/`None`, a wrong secret, the refresh secret, a wrong `iss`, an expired token, a tampered payload
  under the original signature, lowercase `bearer`, a token in the query or in a cookie, and forged-signature tokens
  (401, and no separate rate-limit bucket).
- **Impact:** it needs `JWT_ACCESS_SECRET`, so this is defense in depth only. A token minted by a script or a leaked
  CLI helper would never expire, short of a password change, which bumps `pv`.
- **Fix:** in `userFromAccessToken`, `if (typeof payload.exp !== 'number') return null;`, or add `maxAge: '15m'` to
  `verifyOptions` (jsonwebtoken checks it against `iat`).

### [P2-7] `pg` warns that Prisma runs concurrent queries on one client (this throws in pg 9)
- **Where:** seen on `GET /section-changes` (admin) and `POST /auth/password`: `$transaction([...])` batches and the
  interactive transaction in `changePassword`. `pg` is 8.23.1.
- **Evidence:** `DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0`
  (`api-run1.log:744`, `api-run2.log:220`).
- **Fix:** pin `pg` below 9 in the root `overrides` until `@prisma/adapter-pg` serialises its queries. Add a spec that
  fails on that warning (`process.on('warning')`) so the upgrade is caught.

### INFO
- **I-1:** a refresh with a cookie that a logout or a deactivation revoked is logged as `WARN Refresh token reuse ...;
  revoking its session family` (`auth.service.ts:133`). That is a false theft alert, and noise for whoever monitors
  WARN. Telling a revoke-by-logout apart from a rotation would need a `revokedReason` column.
- **I-2:** in `GET /users?search=%`, `%` and `_` act as LIKE wildcards (`%` returned every account). Admin only,
  harmless; escape them if exact search matters.
- **I-3:** roster import accepts names that start with `=`, `+` or `@` (`=HYPERLINK("http://evil/","clic")` was created
  as a student's last name). Every output is safe: the web's `csvCell` (`apps/web/.../admin-format.ts:143`) prefixes `'`,
  templates use interpolation, and pdfmake writes text. Refusing such names at import would close it for future
  exports.
- **I-4:** in production the boot line still says `docs at /api/docs`, which then answers 404, as intended.
- **I-5:** `POST /rollover/apply` ran in the middle of the year (20 Nov) and archived the current year at once, with no
  date check or confirmation beyond the plan hash. Admin only. Worth a « the year is not over » warning in the preview.
- **I-6:** any teacher may post an announcement to the whole school or to a section (`posts.service.ts:50-61` checks
  only `classId`). Confirm this is wanted.
- **I-7:** `GET /events/:id/completions` is open to every teacher of the class, whatever the subject, and its rows
  carry the student's `userId`. Low sensitivity.

## 3. What passed

**Input**
- Unknown fields gave 400 (`forbidNonWhitelisted`) everywhere I tried, including mass-assignment attempts:
  `authorId` on posts and events, `role` and `passwordHash` on `PATCH /users/:id`, `isAdmin` on contact.
- Wrong types, null fields, an empty body, no body, an array body and malformed JSON all gave 400. A JSON
  `__proto__` key was harmless.
- A 150 KB or 2 MB body gave 413 with the standard shape. Over-long strings gave 400 with the limit.
- Dates (`2026-02-31`), times (`25:99`), `javascript:` attachments and non-UUID params gave 400. Query `page=abc` and
  `pageSize=100000` gave 400. `' OR 1=1 --` in a search returned 0 rows (parameterised).
- Arabic, accented text and emoji round-trip exactly in contact messages, posts, event titles and group
  division/label. HTML and `<script>` payloads are stored verbatim as text.
- The web renders all of these with interpolation. The only `bypassSecurityTrust*` is the webcal URL the API itself
  returns (`agenda-sync-page.ts:238`), and attachments go through `safeAttachments`.

**CSV import**
- An existing homonym is « déjà présent » (`matchedBy: name`). Two identical new lines get `sami.nouveau` and
  `sami.nouveau2`, with « car 1 homonyme ».
- An Arabic-only name is refused with a French reason. Arabic plus Latin is accepted, and the address uses the Latin
  part.
- A BOM and `;` separators are accepted. Unknown columns and binary files give per-line errors. `role=admin` gives
  400. A 1.2 MB file gives 413 « File too large ».
- No server-side CSV export exists. The account list with passwords is built in the browser with formula escaping.

**Rate limits at the real defaults**
- Login: 5 a minute per account and address (the 6th try and then the right password get 429 with `Retry-After: 60`).
  An e-mail in other case or with spaces counts as the same account. Another account from the same address still
  signs in. The address as a whole is capped at 60 a minute.
- `POST /auth/password`: 5. `forgot-password`: 5 per identifier.
- Refresh: 10 per cookie (the 11th gets 429).
- Contact: 5 a minute. Import: 10 a minute, preview 20.
- General: 120 per account and route, and another account is not affected.

**Logs and health**
- With `NODE_ENV=production` every line is JSON with `school` and `requestId`. A valid `X-Request-Id` is echoed; an
  invalid one is replaced by a UUID. The feed path is logged as `:token` and query strings are dropped.
- A grep of the production log found no e-mail address, token, password, `Bearer` or cookie, including a contact
  message whose body said `password=hunter2 token=abc`. The SMTP failure line names only the user id and
  `Error ESOCKET`. The dev log transport redacts the reset token (`token=[redacted]`).
- `/api/health` returns `{status, version: "0.0.0", migration: "20261119080945_password_reset_mail_outbox"}`.
  `/api/health/db` answers 200 directly and 404 with `X-Forwarded-For` (even empty), `X-Real-IP` or `Forwarded`.
- `/api/docs` is off in production.

**Cookies and CORS**
- The refresh cookie is `HttpOnly; SameSite=Strict; Path=/api/auth`, with `Secure` in production (and not in
  development). Logout clears it.
- A CORS preflight from `https://evil.example` gets no `Access-Control-Allow-Origin`.

**Shutdown and outbox**
- I simulated SIGTERM: Windows cannot deliver a catchable SIGTERM to node, so a preload emitted it to Nest's own
  listener, as `docker stop` would. It arrived 4 ms after a `forgot-password` 204.
- The token row was still written (seed kept), the mailer did not start a new send, and the process exited cleanly
  without errors.
- On the next boot the scan sent the mail within 2 s (`mailed_at` set, seed cleared, `mail_attempts: 1`). Nothing was
  lost.

**Password reset**
- `forgot-password` answers 204 in 3 ms for a known account and 2 ms for an unknown one; a disabled account also gets
  204.
- The mail link points to `PUBLIC_WEB_URL/connexion/reinitialiser?token=`. The raw token is not in the database, and
  the seed is cleared after sending.
- A weak password gives 400 first, without spending the token. The first use gives 204, the second 400 « lien
  invalide ». The old password then gives 401 and the new one 200.

**Temporary passwords and first sign-in**
- With a UTC session, an expired temporary password gives 401 on login and on refresh, with the French message
  (see P2-5 for the access-token gap).
- `mustChangePassword` closes every route with 403 `PASSWORD_CHANGE_REQUIRED` except `/auth/me` and
  `POST /auth/password`.

**Calendar feed**
- The feed is valid, in `text/calendar` with `private, no-store` and `noindex`.
- A wrong secret gives 404 « Agenda introuvable. », and so does the address after `DELETE /calendar/feed`. The admin
  gets 403.

**Report cards**
- `generate` on an open period gives 409. After closing, 10 cards are generated and then published.
- The PDF is a 22 KB `%PDF-1.3` named `bulletin-1-marc-fahmy.pdf`, with the access rules listed above.
- Grade writes in a closed period give 409.

**Rollover**
- A preview, then an apply with a wrong hash gives 400. The apply creates 2027-2028 (6 classes, 3 periods, 87 class
  subjects…) and archives 2026-2027.
- A second preview shows `create: 0` everywhere, and a second apply creates nothing: idempotent. Counts after:
  2 years, 12 classes.

**Archived year**
- 409 `YEAR_ARCHIVED` (French message) on: event create and delete, grades, attendance, class PATCH, enrolment,
  group create, calendar day, slot exception, slot delete (`scope=all`) and the year's PATCH. A period PATCH gives
  409 « période clôturée ».

**Tokens**
- alg none, wrong or refresh secret, wrong issuer, expired and tampered tokens give 401. A role forged in the payload
  is ignored (the role is read from the database).
- A disabled user's access token, refresh and login all give 401.
- Refresh reuse revokes the family: the old cookie and the new one both give 401. Refresh after logout gives 401.
- Login timing: unknown account 93 ms, wrong password 71 ms, disabled account 75 ms (dummy argon2 hash).

## 4. Coverage and limits
- I exercised every route for the role matrix. The ownership checks covered events, grades, attendance, completions,
  homework, groups, activity types, timetable slots, posts, report cards, students, section changes, classes and
  periods.
- Not exercised against data: other users' notifications (no rows), `planner/absence` writes, section-change approval,
  and the digest mails (`sendDigests`). These are covered by the e2e suite, which I did not rerun.
- Graceful shutdown was simulated: SIGTERM was emitted inside the process because Windows cannot deliver it. Confirm
  with `docker stop` on the Linux image.
- The data was changed during the run: period 1 closed, rollover applied, QA accounts created and one disabled.
  Re-seed before reusing `cdls_apiaudit`. `apps/api/.env` here holds the default limits plus the UTC `options`
  parameter. The matrix-run copy is `env.matrix.bak` next to this file.

→ Recommended next: fix P2-1 (UTC session) and P2-5 together (both in auth/DB time handling), then P2-2/P2-3 (calendar
files), then re-run `limits.mjs`, `features1.mjs` and `icscheck.mjs` from this folder.

## Appendix: full role matrix (random ids, empty bodies)

| Method | Path | Guard | anon | student | teacher | planner | admin |
|---|---|---|---|---|---|---|---|
| GET | `/activity-types` | admin+teacher | 401 | 403 | 200 | 200 | 200 |
| POST | `/activity-types` | admin+teacher | 401 | 403 | 400 | 400 | 400 |
| PATCH | `/activity-types/:id` | admin+teacher | 401 | 403 | 404 | 404 | 404 |
| DELETE | `/activity-types/:id` | admin+teacher | 401 | 403 | 404 | 404 | 404 |
| POST | `/activity-types/:id/promote` | admin | 401 | 403 | 403 | 403 | 404 |
| GET | `/events/:id/attendance` | teacher+admin | 401 | 403 | 400 | 400 | 400 |
| PUT | `/events/:id/attendance` | teacher+admin | 401 | 403 | 400 | 400 | 400 |
| GET | `/students/:id/attendance` | signed-in | 401 | 403 | 403 | 403 | 200 |
| POST | `/auth/login` | public | 400 | 400 | 400 | 400 | 400 |
| POST | `/auth/refresh` | public | 401 | 401 | 401 | 401 | 401 |
| POST | `/auth/logout` | public | 204 | - | - | - | - |
| POST | `/auth/password` | signed-in | 401 | 400 | 400 | 400 | 400 |
| POST | `/auth/forgot-password` | public | 400 | 400 | 400 | 400 | 400 |
| POST | `/auth/reset-password` | public | 400 | 400 | 400 | 400 | 400 |
| GET | `/auth/me` | signed-in | 401 | 200 | 200 | 200 | 200 |
| GET | `/calendar-days` | signed-in | 401 | 400 | 400 | 400 | 400 |
| POST | `/calendar-days` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| PATCH | `/calendar-days/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| DELETE | `/calendar-days/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| GET | `/calendar/feed` | student+teacher | 401 | 200 | 200 | 200 | 403 |
| POST | `/calendar/feed` | student+teacher | 401 | 201 | 201 | 201 | 403 |
| DELETE | `/calendar/feed` | student+teacher | 401 | 204 | 204 | 204 | 403 |
| GET | `/calendar/feed/:file` | public | 404 | 404 | 404 | 404 | 404 |
| GET | `/classes/:id/subjects` | admin+teacher | 401 | 403 | 404 | 404 | 404 |
| POST | `/classes/:id/subjects` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| POST | `/classes/:id/subjects/copy` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| PATCH | `/class-subjects/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| DELETE | `/class-subjects/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| GET | `/sections` | signed-in | 401 | 200 | 200 | 200 | 200 |
| GET | `/classes` | signed-in | 401 | 200 | 200 | 200 | 200 |
| GET | `/classes/:id` | signed-in | 401 | 404 | 404 | 404 | 404 |
| POST | `/classes` | admin | 401 | 403 | 403 | 403 | 400 |
| PATCH | `/classes/:id` | admin | 401 | 403 | 403 | 403 | 404 |
| DELETE | `/classes/:id` | admin | 401 | 403 | 403 | 403 | 404 |
| GET | `/classes/:id/students` | admin+teacher | 401 | 403 | 404 | 404 | 404 |
| POST | `/classes/:id/enrollments` | admin | 401 | 403 | 403 | 403 | 400 |
| DELETE | `/enrollments/:id` | admin | 401 | 403 | 403 | 403 | 404 |
| POST | `/contact` | public | 400 | 400 | 400 | 400 | 400 |
| GET | `/contact-messages` | admin | 401 | 403 | 403 | 403 | 200 |
| POST | `/contact-messages/handle` | admin | 401 | 403 | 403 | 403 | 400 |
| DELETE | `/contact-messages/:id` | admin | 401 | 403 | 403 | 403 | 404 |
| PATCH | `/contact-messages/:id` | admin | 401 | 403 | 403 | 403 | 400 |
| GET | `/events` | signed-in | 401 | 400 | 400 | 400 | 400 |
| GET | `/events/occurrences` | signed-in | 401 | 400 | 400 | 400 | 400 |
| GET | `/events/:id` | signed-in | 401 | 404 | 404 | 404 | 404 |
| GET | `/events/:id/ics` | signed-in | 401 | 404 | 404 | 404 | 404 |
| POST | `/events` | teacher+admin | 401 | 403 | 400 | 400 | 400 |
| PATCH | `/events/:id` | teacher+admin | 401 | 403 | 404 | 404 | 404 |
| DELETE | `/events/:id` | teacher+admin | 401 | 403 | 404 | 404 | 404 |
| GET | `/events/:id/grades` | teacher+admin | 401 | 403 | 404 | 404 | 404 |
| PUT | `/events/:id/grades` | teacher+admin | 401 | 403 | 400 | 400 | 400 |
| POST | `/events/:id/grades/publish` | teacher+admin | 401 | 403 | 400 | 400 | 400 |
| GET | `/students/:id/grades` | signed-in | 401 | 403 | 403 | 403 | 404 |
| POST | `/grading/assessments` | teacher | 401 | 403 | 400 | 400 | 403 |
| GET | `/grading/pending` | teacher | 401 | 403 | 400 | 400 | 403 |
| GET | `/groups/mine` | student | 401 | 200 | 403 | 403 | 403 |
| GET | `/groups` | admin+teacher | 401 | 403 | 400 | 400 | 400 |
| GET | `/groups/:id` | admin+teacher | 401 | 403 | 404 | 404 | 404 |
| POST | `/groups` | admin+teacher | 401 | 403 | 400 | 400 | 400 |
| PATCH | `/groups/:id` | admin+teacher | 401 | 403 | 404 | 404 | 404 |
| DELETE | `/groups/:id` | admin+teacher | 401 | 403 | 404 | 404 | 404 |
| POST | `/groups/:id/members` | admin+teacher | 401 | 403 | 400 | 400 | 400 |
| DELETE | `/groups/:id/members/:studentId` | admin+teacher | 401 | 403 | 404 | 404 | 404 |
| GET | `/health` | public | 200 | 200 | 200 | 200 | 200 |
| GET | `/health/db` | public | 200 | 200 | 200 | 200 | 200 |
| GET | `/homework` | student | 401 | 200 | 403 | 403 | 403 |
| PUT | `/homework/:eventId/done` | student | 401 | 404 | 403 | 403 | 403 |
| DELETE | `/homework/:eventId/done` | student | 401 | 404 | 403 | 403 | 403 |
| GET | `/events/:id/completions` | teacher+admin | 401 | 403 | 404 | 404 | 404 |
| GET | `/notifications` | signed-in | 401 | 200 | 200 | 200 | 200 |
| GET | `/notifications/summary` | signed-in | 401 | 200 | 200 | 200 | 200 |
| GET | `/notifications/preferences` | signed-in | 401 | 200 | 200 | 200 | 200 |
| PUT | `/notifications/preferences` | signed-in | 401 | 400 | 400 | 400 | 400 |
| POST | `/notifications/read-all` | signed-in | 401 | 200 | 200 | 200 | 200 |
| POST | `/notifications/:id/read` | signed-in | 401 | 404 | 404 | 404 | 404 |
| POST | `/school-years/:id/periods` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| PATCH | `/periods/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| DELETE | `/periods/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| POST | `/periods/:id/close` | admin | 401 | 403 | 403 | 403 | 404 |
| GET | `/planner/teachers` | admin+planner | 401 | 403 | 403 | 200 | 200 |
| GET | `/planner/absence` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| POST | `/planner/absence` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| GET | `/planner/today` | admin+planner | 401 | 403 | 403 | 200 | 200 |
| GET | `/planner/rooms-now` | admin+planner | 401 | 403 | 403 | 200 | 200 |
| GET | `/planner/timetables` | admin+planner | 401 | 403 | 403 | 200 | 200 |
| GET | `/posts` | signed-in | 401 | 200 | 200 | 200 | 200 |
| POST | `/posts` | teacher+admin | 401 | 403 | 400 | 400 | 400 |
| DELETE | `/posts/:id` | teacher+admin | 401 | 403 | 404 | 404 | 404 |
| POST | `/periods/:id/report-cards/generate` | admin | 401 | 403 | 403 | 403 | 404 |
| POST | `/periods/:id/report-cards/publish` | admin | 401 | 403 | 403 | 403 | 404 |
| GET | `/periods/:id/report-cards` | admin+teacher | 401 | 403 | 403 | 403 | 200 |
| GET | `/students/:id/report-cards` | signed-in | 401 | 403 | 403 | 403 | 200 |
| PATCH | `/report-cards/:id` | admin+teacher | 401 | 403 | 400 | 400 | 400 |
| GET | `/report-cards/:id/pdf` | signed-in | 401 | 404 | 404 | 404 | 404 |
| GET | `/periods/:id/report-preparation` | admin | 401 | 403 | 403 | 403 | 404 |
| POST | `/periods/:id/report-preparation/reminders` | admin | 401 | 403 | 403 | 403 | 404 |
| POST | `/rollover/preview` | admin | 401 | 403 | 403 | 403 | 400 |
| POST | `/rollover/apply` | admin | 401 | 403 | 403 | 403 | 400 |
| GET | `/rooms` | admin+teacher | 401 | 403 | 200 | 200 | 200 |
| POST | `/rooms` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| PATCH | `/rooms/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| DELETE | `/rooms/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| GET | `/school-years` | signed-in | 401 | 200 | 200 | 200 | 200 |
| POST | `/school-years` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| PATCH | `/school-years/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| POST | `/school-years/:id/current` | admin | 401 | 403 | 403 | 403 | 404 |
| DELETE | `/school-years/:id` | admin | 401 | 403 | 403 | 403 | 404 |
| GET | `/section-changes` | admin | 401 | 403 | 403 | 403 | 200 |
| GET | `/section-changes/mine` | student | 401 | 200 | 403 | 403 | 403 |
| POST | `/section-changes` | student+admin | 401 | 400 | 403 | 403 | 400 |
| POST | `/section-changes/:id/approve` | admin | 401 | 403 | 403 | 403 | 400 |
| POST | `/section-changes/:id/reject` | admin | 401 | 403 | 403 | 403 | 400 |
| GET | `/subjects` | signed-in | 401 | 200 | 200 | 200 | 200 |
| POST | `/subjects` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| PATCH | `/subjects/:id` | admin+planner | 401 | 403 | 403 | 404 | 404 |
| GET | `/teacher/summary` | teacher | 401 | 403 | 200 | 200 | 403 |
| GET | `/teaching-assignments` | admin+teacher | 401 | 403 | 200 | 200 | 200 |
| POST | `/teaching-assignments` | admin | 401 | 403 | 403 | 403 | 400 |
| DELETE | `/teaching-assignments/:id` | admin | 401 | 403 | 403 | 403 | 404 |
| GET | `/timetable/slots` | admin+planner | 401 | 403 | 403 | 200 | 200 |
| GET | `/timetable/slots/:id` | admin+planner+teacher | 401 | 403 | 404 | 404 | 404 |
| POST | `/timetable/slots` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| PATCH | `/timetable/slots/:id` | admin+planner+teacher | 401 | 403 | 400 | 400 | 400 |
| DELETE | `/timetable/slots/:id` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| POST | `/timetable/slots/:id/exceptions` | admin+planner+teacher | 401 | 403 | 400 | 400 | 400 |
| DELETE | `/timetable/exceptions/:id` | admin+planner+teacher | 401 | 403 | 404 | 404 | 404 |
| POST | `/timetable/check` | admin+planner+teacher | 401 | 403 | 400 | 400 | 400 |
| GET | `/timetable/occurrences` | signed-in | 401 | 400 | 400 | 400 | 400 |
| GET | `/timetable/warnings` | admin+planner | 401 | 403 | 403 | 400 | 400 |
| GET | `/timetable/free-rooms` | admin+planner+teacher | 401 | 403 | 400 | 400 | 400 |
| GET | `/users` | admin | 401 | 403 | 403 | 403 | 200 |
| GET | `/users/:id` | admin | 401 | 403 | 403 | 403 | 404 |
| POST | `/users` | admin | 401 | 403 | 403 | 403 | 400 |
| POST | `/users/import/preview` | admin | 401 | 403 | 403 | 403 | 400 |
| POST | `/users/import` | admin | 401 | 403 | 403 | 403 | 400 |
| POST | `/users/archive` | admin | 401 | 403 | 403 | 403 | 400 |
| PATCH | `/users/:id` | admin | 401 | 403 | 403 | 403 | 404 |
| DELETE | `/users/:id` | admin | 401 | 403 | 403 | 403 | 404 |
