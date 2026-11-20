# Phase 3: database audit (main 20d1b34, 2026-11-20)

## Verdict

**The schema is sound: no migration drift, the upgrade from 9e41612 keeps data, every foreign key is indexed, the seed's integrity checks pass, and a backup restores identically. One blocker sits next to the database, though: `deploy/compose.yaml` does not parse on main, so neither the stack nor its backup container can start (P0).** The scale run also found one P1. At 600 students the rollover preview takes 5 to 10 s, and almost all of it is one conflict query that does quadratic work. A one-line join change makes that query 37 times faster. The rest are P2 hardening items.

| Priority | Count |
|---|---|
| P0 | 1 |
| P1 | 1 |
| P2 | 9 |

### Environment

- **Database:** my own embedded PostgreSQL 18.4 (`DEV_DB_PORT=5470`, database `cdls_dbaudit`, data in this worktree's `apps/api/.dev-db/`), with throwaway databases `cdls_dbaudit_shadow` and `cdls_dbaudit_upg`. The extra databases were dropped and the server and API stopped at the end.
- **Client tools:** the embedded-postgres package ships only `initdb`, `pg_ctl` and `postgres`, with no `psql`, `pg_dump` or `pg_restore`. I used the client binaries of the installed PostgreSQL 18.6 (`C:\Program Files\PostgreSQL\18\bin`). Only the client binaries ran; the system service was not touched.
- **Repository:** no application code, schema or migration changed, nothing committed (`git status` clean).
- **Throwaway files:** the scripts and SQL below are in `C:\Users\moham\AppData\Local\Temp\claude\2e23f1a7cfd9f1f2\fce79761-8e93-4fb0-a5e0-93a93a24fae1\scratchpad\qa\`: `sql/catalog.sql`, `sql/integrity.sql`, `sql/scale.sql`, `sql/clashes.sql`, `sql/occ-insert.sql`, `sql/collation.sql`, `drive.mjs`, `analyze.mjs`, `drill.sh`. Query logs are in `logs/`.

---

## P0

### P0-1 `deploy/compose.yaml` does not parse: duplicate `LOG_LEVEL` key

- **Evidence:** `deploy/compose.yaml:80-81` holds two identical lines, `LOG_LEVEL: ${LOG_LEVEL:-info}`. Both came from commit 9a306a3 (`git blame`).
  ```
  $ docker compose -f deploy/compose.yaml config --quiet        # Docker Compose v5.5.1
  failed to parse ...\deploy\compose.yaml: yaml: construct errors: line 8: line 81:
  mapping key "LOG_LEVEL" already defined at line 80
  ```
- **Expected:** `docker compose ... up` (docs/deployment.md) and the backup and restore commands (`deploy/restore.md`, `deploy/scripts/backup-now`) work.
- **Actual:** every `docker compose -f deploy/compose.yaml ...` command fails before doing anything. That means no deployment, no nightly backup container, and no restore through the documented commands.
- **Fix:** delete line 81. Add `docker compose -f deploy/compose.yaml config --quiet` to the pre-merge checks in CLAUDE.md ("CI-less: run both packs before a merge"), so a broken compose file is caught before it lands.

## P1

### P1-1 Rollover preview and apply: the conflict probe does quadratic work (5 to 10 s at 600 students)

- **Where:** `apps/api/src/occupancy/occupancy.service.ts:182-199` (`clashes()`), called by the rollover through `detectBySlot` with every index row of the new year at once.
- **Measured** on the scaled school (24 classes, 484 slots, 17,927 index rows), median of 7 runs without query logging: `POST /rollover/preview` takes **6.0 s** (runs ranged from 5.0 to 10.4 s).
- **Where the time goes:** the query log shows two statements per call.
  - The `clashes()` probe takes **4.0 to 5.9 s**.
  - The occupancy `INSERT` of about 18k rows (5 EXCLUDE plus 8 btree indexes) takes 3 to 5 s with plan logging on, and **2.46 s** without it (`sql/occ-insert.sql`, rolled back).
- **Why the probe is slow:** PostgreSQL assumes `jsonb_to_recordset` returns 100 rows; it returns 17,524. So it builds a hash join on `room_id` (40 rooms) and `teacher_id` alone, then tests the `during &&` overlap for every pair:
  ```
  Hash Join (actual time=2849..2849 rows=0)  Hash Cond: (o.room_id = c.room_id)
    Join Filter: (o.during && tsrange(c.starts_at, c.ends_at))   Rows Removed by Join Filter: 9457572
  Hash Join (actual time=3071..3071 rows=0)  Hash Cond: (o_1.teacher_id = c_1.teacher_id)
                                                                 Rows Removed by Join Filter: 8910186
    ->  Function Scan on jsonb_to_recordset c_4 (rows=100 estimated, actual rows=17524)
    ->  Seq Scan on occupancy o (rows=17927)
  ```
- **Why it gets worse over time:** the work is candidates × index rows per room or teacher. Index rows of archived years are never pruned, so the table grows by about 18k rows a year, and a fuller real timetable (the seed has about 20 lessons per class per week) adds more. The rollover transaction allows 120 s (`rollover.service.ts:140`) and holds the rollover advisory lock and the source year row lock all along. On apply it also holds the archive lock, which blocks every write into the old year.
- **Fix (checked):** add the calendar day to the hash key. Sessions never cross midnight: the slot CHECK says end > start as `HH:MM`, and events have one date. For each of the four branches:
  ```sql
  FROM c JOIN occupancy o ON o.room_id = c.room_id
        AND lower(o.during)::date = c.starts_at::date      -- new: hashable
        AND o.during && tsrange(c.starts_at, c.ends_at)
  ```
  `sql/clashes.sql` replays the same 17,927 candidates. The current query takes **6,568 ms**; the variant takes **176 ms**. Run on unshifted candidates, both find the same 17,927 room clashes.
  - **Alternatives:** load the candidates into a temp table and `ANALYZE` it, or probe in chunks.
  - **Optional:** prune or partition occupancy rows of archived years. They can never clash with a new year.

## P2

### P2-1 In Docker the API connects as a PostgreSQL superuser

- **Evidence:** `deploy/compose.yaml:38-40` sets `POSTGRES_USER: cdls`, which the official image creates as a superuser, and the API's `DATABASE_URL` (line 70) uses that same role. The native path does it right: `apps/api/prisma/setup-database.sql` creates `cdls` with `LOGIN CREATEDB` only. The embedded dev cluster is also a superuser (`rolsuper = t`).
- **Exposure:** defense in depth only. There is no `$queryRawUnsafe`, `$executeRawUnsafe` or `Prisma.raw(` in `apps/api/src`, so I found no injection path. But any future SQL injection would get superuser powers (`COPY ... TO PROGRAM` means shell access in the db container).
- **Fix:** keep the superuser for the image and the backup container. Add an init script under `/docker-entrypoint-initdb.d` that creates a `cdls_app` role (LOGIN, NOSUPERUSER, NOCREATEROLE) owning the `cdls` database and its `public` schema, and point the API's `DATABASE_URL` at it.
  - The migrations need `CREATE EXTENSION btree_gist`. `btree_gist` is a trusted extension, so a database owner can create it.
  - Document this in docs/deployment.md.

### P2-2 Collation: dev sorts in byte order (`C`), production in `en_US.utf8`, and the code mixes database and JavaScript sorting

- **Evidence:**
  - Dev clusters are created with `initdbFlags: ['--locale=C']` (`apps/api/scripts/dev-db.mjs:36`; all databases show `datcollate = C`).
  - The production image initialises with `LANG=en_US.utf8` (libc), confirmed with `docker image inspect postgres:18`, and compose sets no `POSTGRES_INITDB_ARGS`.
  - The API sorts by last name in the database in 37 places (`orderBy ... lastName: 'asc'`, for example `classes.service.ts:197`, `groups.service.ts:324`, `targets.service.ts:217`), but in JavaScript in others (`attendance.service.ts:65`: `localeCompare(..., 'fr')`).
  - `sql/collation.sql`:
    ```
    C       : Abdel < Eid < Ezz < Zaki < abou < el-Masri < Élise < Émile < أحمد < إبراهيم < عادل < ياسر
    fr-x-icu: Abdel < abou < Eid < el-Masri < Élise < Émile < Ezz < Zaki < أحمد < إبراهيم < عادل < ياسر
    ```
- **Actual:** in dev, lower-case and accented French names sort after « Z », so rosters are in a different order than in production and than the attendance screen. Arabic names sort the same under both. libc collations also change with glibc versions, so an image bump can silently invalidate the text indexes (`users_email_key`, the name indexes).
- **Fix:** pick ICU everywhere.
  - In compose: `POSTGRES_INITDB_ARGS: "--locale-provider=icu --icu-locale=fr --locale=C.UTF-8"` (new installs only).
  - In dev-db: the same initdb flags.
  - Or, independent of the cluster: a migration giving `users.first_name/last_name` `COLLATE "fr-x-icu"`.
  - Make the screens agree on one ordering (database or `localeCompare('fr')`).

### P2-3 Enrolment dates left to `@default(now())` are UTC dates, not the school's date

- **Evidence:** `users.service.ts:187` (create) and `:386` (roster import) create enrolments without `enrolledOn`. The DB default is `CURRENT_TIMESTAMP`, but Prisma fills `now()` client-side. A probe against a database whose session zone was `Pacific/Kiritimati` (local date 2026-11-21) stored `enrolledOn = 2026-11-20T00:00:00Z`, the UTC date of the Node clock (probe rolled back, file deleted).
- **Actual:** an account created or imported between 00:00 and 02:00 (03:00 in summer) Cairo time gets yesterday's `enrolled_on`. Every other path passes `schoolToday()`: `classes.service.ts:245`, `section-changes.service.ts:207`, `groups.service.ts:238`, and the rollover passes the year's start.
- **Fix:** `enrollments: { create: { classId, schoolYearId, enrolledOn: fromDay(schoolToday()) } }` in both places. The server zone itself does not matter: Docker is UTC and dev inherits Africa/Cairo, but no raw SQL uses `now()`, `CURRENT_DATE` or a session-zone cast.

### P2-4 "Exactly one current year" is only enforced by the service and can race

- **Evidence:** the schema comment says "enforced by the service" (`schema.prisma:247`), and the catalog has no constraint on `school_years.is_current`. `makeCurrent` locks only the target row (`school-years.service.ts:117`) and then runs `updateMany(isCurrent → false)`. Two admins making years A and B current at the same moment lock different rows, and under READ COMMITTED each `updateMany` misses the other's uncommitted change. Both years end up current. `AccessService` (`findFirst({ isCurrent: true })`) then picks either one.
- **Fix:** a new migration with `CREATE UNIQUE INDEX school_years_one_current_key ON school_years ((true)) WHERE is_current;`. Both `makeCurrent` and the rollover already clear the old year before setting the new one, so no legitimate write breaks.

### P2-5 Checks the schema documents or the data implies, but the database does not enforce

These are consistent in the data today (integrity checks 4 and 5b below return 0), but nothing in the database holds them:

- **`school_years`:** no `CHECK (ends_on > starts_on)`. The service checks it (`school-years.service.ts:33,63`); `periods` and `calendar_days` have their CHECKs.
- **`enrollments`:** no `CHECK (left_on IS NULL OR left_on >= enrolled_on)` (`group_members` has the same CHECK).
- **`attendance.minutes_late`:** no `>= 0` check.
- **Coefficients:** `class_subjects.coefficient` and `events.coefficient` have no `> 0` check.
- **`report_cards.average`:** no `0..20` check.
- **Denormalised copies:** `enrollments.school_year_id` must equal the class's year (schema comment "denormalised so the unique constraint below can hold"), and `group_members.class_id/division` must equal the group's. A composite FK would hold both: `UNIQUE (id, school_year_id)` on `school_classes` plus `FOREIGN KEY (class_id, school_year_id)`; likewise `(id, class_id, division)` on `groups`.
- **Fix:** one migration with these CHECKs and the two composite FKs. Validate them against production data first (`NOT VALID`, then `VALIDATE`).

### P2-6 Connection pool and timeouts are implicit

- **Pool:** `PrismaService` builds `new PrismaPg({ connectionString })` (`prisma.service.ts:23-25`), so it runs on pg-pool defaults: `max = 10`, `idleTimeoutMillis = 10000`, and no `connectionTimeoutMillis` (a request waits forever when all 10 are busy or the database hangs). Read from `node_modules/pg-pool/index.js:89-99`.
- **Server:** compose sets `max_connections=60` (`compose.yaml:44`). 10 API connections, plus 1 for the backup and 1 for `migrate deploy`, leaves ample headroom, so the sizing is fine. There is no `statement_timeout` or `idle_in_transaction_session_timeout`.
- **Fix:**
  - Set `new PrismaPg({ connectionString, max: 10, connectionTimeoutMillis: 5_000 })` so the size is explicit and a stuck pool answers with an error instead of hanging.
  - Add `-c idle_in_transaction_session_timeout=60s` to the db command, so a crashed client cannot hold locks indefinitely.

### P2-7 Slow-query logging writes bind parameters in full

- **Evidence:** `compose.yaml:44` sets `log_min_duration_statement=1000` and leaves `log_parameter_max_length` at its default of -1. With -1, PostgreSQL logs every bind parameter in full for statements over the threshold, and Prisma always sends parameters.
- **Exposure:** a slow statement's names, e-mails or password hashes end up in the container log (json-file, kept with `max-file: 3`) and outside the encrypted backups. The statements that took over 1 s in this audit carried only ids and times, so I saw no leak today.
- **Fix:** add `-c log_parameter_max_length=0`.

### P2-8 Seed: a gradable homework with no period

- **Evidence:** `apps/api/prisma/seed-groups.ts:79` creates « Compte rendu du TP de chimie » (type `devoir`, gradable) without `periodId`. Integrity check 8 finds exactly this one row: `gradable_events_no_period = 1`. The API always gives a gradable event a period. Report cards follow `Event.periodId`, so marks entered on this demo event would never count.
- **Fix:** give it `periodId: term 1` in the seed.

### P2-9 Small consistency items

- **Ids:** `OccupancyService` inserts ids with `gen_random_uuid()`, which makes v4 UUIDs (`occupancy.service.ts:130`). Every other table uses uuidv7, which keeps the primary key index ordered. Use `uuidv7()`.
- **Const arrays:** `OccupancySource` (`packages/shared/src/timetable.ts:400`) is a string union with no exported const array, which the CLAUDE.md type-safety rule asks for, and `NotificationMailState` has no shared type at all. Both enums match the database (see "Enums" below).

---

## What passed

### 1. Migrations

- **Empty database:** `prisma migrate deploy` applied all 23 migrations in 5.2 s, and `migrate-status` (Prisma MCP) said "Database schema is up to date!".
- **Drift:** `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`, with shadow database `cdls_dbaudit_shadow` set through a scratch Prisma config, printed `-- This is an empty migration.` Live database against the schema: also empty.
- **Upgrade from 9e41612:**
  - The 21 migrations of 9e41612 (`git archive`) deployed on a fresh `cdls_dbaudit_upg` and seeded. I used the current seed; its only change since then is where section labels come from.
  - Three reset-token rows were added in the old shape: 2 unused, 1 used.
  - Deploying the current migrations on top applied `20261117234856_posts_subject_index` and `20261119080945_password_reset_mail_outbox`.
  - Row counts of all 35 tables and md5 digests of `users` and `grades` were identical before and after (only `_prisma_migrations` went from 21 to 23). The old token rows satisfy the new `password_reset_tokens_outbox_check` (seed, next try and mailed date all null; attempts 0).
  - The upgraded database diffs empty against the schema. The 21 shared migration files are byte-identical between the two commits (`git diff --stat` lists only the 2 new ones).

### 2. Catalog (`sql/catalog.sql`, run on the migrated database)

- **Foreign keys:** 72 foreign keys. **None lacks an index whose leading columns are the FK columns.** The check skips partial indexes:
  ```sql
  SELECT c.conrelid::regclass, c.conname FROM pg_constraint c
  WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
    AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indpred IS NULL
      AND (string_to_array(i.indkey::text,' ')::int2[])[1:array_length(c.conkey,1)] @> c.conkey
      AND (string_to_array(i.indkey::text,' ')::int2[])[1:array_length(c.conkey,1)] <@ c.conkey);
  -- 0 rows
  ```
- **Primary keys:** every table has one.
- **EXCLUDE constraints:** 7, all as promised by schema comments and CLAUDE.md:
  - `periods_no_overlap` and `periods_number_unique`. The every-section overlap is the trigger `periods_no_overlap_all_sections`, which is present.
  - Occupancy: `occupancy_room_no_overlap`, `occupancy_teacher_no_overlap`, `occupancy_group_no_overlap`, `occupancy_class_whole_no_overlap`, and `occupancy_class_division_no_overlap` (`COALESCE(division_key,'') WITH <>`, so only the same division may share a class).
- **CHECK constraints:** 27, everything the comments name:
  - users: `users_planner_not_student`
  - school years: `school_years_archived_not_current`
  - grades: `grades_score_range` (`out_of > 0`, `0 <= score <= out_of`)
  - dates: `periods_dates_check`, `calendar_days_dates_check`, `timetable_slots_valid_check`, `events_repeat_after_start`, `group_members_dates_check`
  - events: `events_has_author`, `events_one_audience`, `events_times`
  - timetable: `timetable_slots_times_check`, `timetable_slots_weekday_check`, `slot_exceptions_kind_check` (with `study`), `slot_exceptions_times_check`
  - occupancy: `occupancy_origin_check`, `occupancy_holds_check`, `occupancy_during_check`
  - targets: `assessment_targets_scope_check`
  - tokens and feeds: `password_reset_tokens_outbox_check`, `calendar_feeds_secret_hash_check`
  - notifications: `notifications_mailed_check`, `notifications_read_after_created_check`
  - other: `posts_one_audience`, `rooms_capacity_check`, `section_change_requests_sections_differ`, `activity_types_system_check`
- **Unique constraints:** 24, including the partial ones `enrollments_open_student_year_key` (`WHERE left_on IS NULL`), `group_members_open_student_division_key` (`(student_id, class_id, division) WHERE left_on IS NULL`), `section_change_requests_one_pending_key` and `assessment_targets_one_class_key`.
- **Nullability and defaults:** they match `schema.prisma`, since the Prisma diff above compares both and came back empty. `@id @default(uuid(7))` and `@updatedAt` have no database default by design: Prisma fills them, and the raw SQL inserts give their own ids.
- **Column types:** 51 `timestamptz` columns, 21 `date` columns, and one `tsrange` (`occupancy.during`, wall-clock time by design, schema comment line 626). No `timestamp without time zone` columns.
- **Enums:** all 13 database enums carry the same values as the shared const arrays: `ROLES`, `USER_STATUSES`, `ATTENDANCE_STATUSES`, `SECTION_CHANGE_STATUSES`, `PERIOD_KINDS`, `ROOM_KINDS`, `CALENDAR_DAY_TYPES`, `NOTIFICATION_KINDS` (the database order differs because of `ALTER TYPE ... ADD VALUE`, which does not matter), `SLOT_EXCEPTION_KINDS` (with `study`), `ASSESSMENT_TARGET_SCOPES`, `WEEK_PARITIES`, plus `occupancy_source` and `notification_mail_state` (P2-9).
- **Extensions:** only `btree_gist` 1.8 and `plpgsql`.

### 3. Seed integrity (`npm run db:seed -w @cdls/api`, then `sql/integrity.sql`)

- **Row counts:**
  - users 71, students 60, teachers 10, school_classes 6, enrollments 60
  - class_subjects 87, teaching_assignments 87, timetable_slots 121, slot_exceptions 4, occupancy 4,484
  - events 33, grades 120, attendance 60, homework_completions 30, assessment_targets 19
  - groups 4, group_members 20, periods 3, calendar_days 1, posts 3, audit_logs 1, rooms 10, subjects 17, activity_types 9
- **Checks that returned 0 or nothing:**
  - soft links: dangling `audit_logs.entity_id` (one `database` row) and `notifications.entity_id` (none)
  - enrolments: active students without exactly one open enrolment in the single current year; enrolment year ≠ class year
  - groups: two open memberships per (student, class, division); membership class or division ≠ the group's; open members not enrolled in the group's class
  - occupancy overlaps by room, teacher, group, and class (whole class against anything, or a different division)
  - slots: slots with no index rows; index rows outside a slot's validity or on the wrong weekday
  - grades: marks of students not enrolled in the event's class; marks by a teacher who does not teach that class and subject
  - roles: student or teacher rows on an account of the wrong role; a student's section ≠ their class's section
- **One exception:** a gradable event without a period (P2-8).
- **At scale:** the same checks passed on the scaled school (only my synthetic notifications point at made-up entity ids).

### 4. Database user, time zone, pool

- **Role:** see P2-1 (superuser in Docker), P2-6 (pool) and P2-7 (parameter logging).
- **Time zone:** timestamps are `timestamptz` and dates are `date`. The server zone (UTC in Docker, Africa/Cairo for the embedded dev server) never reaches the data: raw SQL builds its timestamps from `YYYY-MM-DD HH:MM` strings (`occupancy.service.ts:429`, `planner.service.ts:125,265`), and the school's day comes from `schoolToday()`. The one gap is P2-3.

### 5. Scale (`sql/scale.sql`, 4.5 s)

**What the script built.** It grew the seed to 600 students (25 per class), 24 classes, 60 teachers, 40 rooms and 16 groups (170 members). Timetable: 484 slots, 17,927 index rows. Term 1: 1,113 events, 25,411 grades and 13,200 roll-call rows. Plus 19,800 notifications. The timetable is cloned with disjoint teachers and rooms, and all EXCLUDE constraints accepted it.

**How I measured.** I ran the real API (`node dist/main.js`, port 3470) against the scaled database, signed in as the demo admin, a maths teacher and a student, and called each read 5 to 7 times. I captured the real SQL and its plans with `auto_explain` (`log_analyze`, `log_buffers`; analysis in `analyze.mjs`). Medians below are without plan logging, on this laptop.

| Hot read | HTTP median | Statements per call | DB time per call | Sequential scans on bigger tables |
|---|---|---|---|---|
| `GET /teacher/summary` (6 class-subject pairs) | 110 ms | ~148 | 7.5 ms | `class_subjects` (348 rows), `timetable_slots` (484), both cheap |
| `GET /grading/pending` | 41 ms | ~14 | 0.7 ms | none |
| `GET /timetable/occurrences` class week | 35 ms | ~20 | 0.7 ms | `class_subjects` 348 rows (0.1 ms) |
| `GET /timetable/occurrences` teacher week | 32 ms | ~20 | 0.6 ms | `timetable_slots` 484 rows (0.1 ms) |
| `GET /events/:id/grades` (sheet, 25 students) | 18 ms | ~17 | 0.9 ms | `students` 600 rows (hash join, 0.4 ms) |
| `GET /periods/:id/report-preparation` (24 classes) | 89 ms | ~12 | 24 ms | `grades` 25,411 rows (the whole term is wanted, hash aggregate 18 to 28 ms, 434 buffers) |
| `GET /notifications?page=1` (student) | 20 ms | ~2 | 0.6 ms | none (`notifications_user_id_created_at_idx`) |
| `GET /notifications/summary` | 10 ms | 1 | 0.05 ms | none (partial `notifications_unread_idx`) |
| `GET /timetable/warnings` one week, whole school | 219 ms | ~326 | 6 ms | `timetable_slots` 484 rows; the time is Node CPU, not the database |
| `POST /rollover/preview` | **6,011 ms** | ~150 | 8.7 s with plan logging | `occupancy` 17,927 rows ×3 in `clashes()` (**P1-1**) |

**What it means:**

- No hot read except the rollover scans a big table where an index would do. The `grades` scan in report preparation reads the whole term on purpose.
- The teacher summary makes about 148 small queries per call (sections, users and classes loaded per included relation in each « Noter » pending lookup), but the database spends only 7.5 ms on them. That is fine while the database sits on the same host.

### 6. Backup and restore drill (`drill.sh`)

- **Script:** I ran the real `deploy/backup/backup.sh` (`BACKUP_ONCE=true`, `BACKUP_DIR_IN=<scratch>`) with the PostgreSQL 18.6 client tools against the scaled database.
- **Encryption:** **`age` is not installed**, so I could not exercise the encrypted path. The refusal path works: with `BACKUP_AGE_RECIPIENT` set, the script printed « BACKUP_AGE_RECIPIENT is set but the age tool is missing: refusing to write clear dumps », exited with 1 and wrote no file.
- **Dump:** custom format, compress level 6, `--no-owner`; **2.0 s**, 2.63 MB, 35 table-data entries.
- **Restore:** into a new `cdls_restore_test` with `pg_restore --no-owner --role=cdls --exit-on-error`, as in `deploy/restore.md` step 3; **4.2 s**, exit 0.
- **Comparison:** row counts of all 35 tables identical, and these all matched:
  - md5 digests of `users`, `grades`, `occupancy` and `attendance`
  - the admin's account row
  - constraint count (352) and index count (154)
  - `_prisma_migrations` (23 rows, same last date)
- **Constraints after restore:** EXCLUDE still enforced. Re-inserting an existing room booking failed with `occupancy_room_no_overlap`. The test database was then dropped.
- **Production caveat:** the compose-based commands of `restore.md` cannot run until P0-1 is fixed.

## Coverage and what is left

- **Checked:** everything above, on PostgreSQL 18.4 under Windows.
- **Not checked:** the Docker images themselves. Compose does not parse (P0-1), and the pinned `postgres:18.7` digest is not pulled locally; its `LANG` and superuser behaviour come from the unpinned local `postgres:18` image and the image documentation.
- **Production hardware:** timings are from a dev laptop, not the production machine.
- **Still to do:**
  - Re-run the rollover timing after the P1-1 fix.
  - Repeat the drill with `age` installed and a real key pair.
  - Check `restore.md` end to end on Docker once compose parses.
  - Write load tests with concurrent users (this audit measured one caller at a time).
