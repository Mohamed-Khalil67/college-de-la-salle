# apps/api — NestJS conventions

NestJS 12 (ESM), Prisma 7 with PostgreSQL 18, Vitest. Read the `nestjs-best-practices` skill before larger changes.

## Layout

- One **feature module** per folder under `src/` (`auth/`, `users/`, `classes/`, `events/`, `grades/`…): `x.module.ts`, `x.controller.ts`, `x.service.ts`, `dto/x.dto.ts`, and specs next to the code (`x.service.spec.ts`). Cross-cutting pieces live in `src/common/` (decorators, roles guard, pagination, dates, audit), permissions in `src/access/`, config in `src/config/`, the database client in `src/prisma/`.
- Import feature modules into `AppModule`. A module exports only what other modules need. No circular imports between modules.
- ESM: relative imports end in `.js` (`import { X } from './x.service.js'`).

## Contract, controllers, DTOs

- **The REST contract lives in `packages/shared/src/api.ts`** (request/response interfaces the web app imports). DTO classes `implements` those interfaces, so a contract change breaks the build until both sides follow. Add the interface there first.
- Controllers stay thin: parse the request, call a service, return a DTO. **No business logic or Prisma calls in controllers.**
- Every body, query and param is a DTO class validated with `class-validator` (global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`). Never accept a raw object. Use `ParseUUIDPipe` for ids.
- Files named `*.dto.ts` are documented automatically by the Swagger CLI plugin (`nest-cli.json`); add `@ApiProperty` only for enums, nullable unions and nested arrays. A `/** comment */` on a route becomes its Swagger summary. Docs: `/api/docs` (JSON at `/api/docs-json`).
- Return response DTOs mapped from Prisma rows (`toXDto()`), never Prisma models (no `passwordHash` leaks). Decimals become `number`, `@db.Date` columns `YYYY-MM-DD` strings (`common/dates.ts`).
- Throw Nest HTTP exceptions from services (`forbidden()`, `notFound()` in `common/errors.ts`); messages are short French sentences shown to users.
- List endpoints that can grow are paginated with `PaginationQueryDto` + `paginated()` and documented with `@ApiPaginatedResponse(Dto)`.
- PATCH DTOs: class instances carry every declared field (unset ones as `undefined`), so drop undefined keys before merging with the current row.

## Auth and permissions

- Every route needs a Bearer access token (global `JwtAuthGuard`) unless marked `@Public()`. `@Roles('admin', …)` restricts by role (global `RolesGuard`). `@CurrentUser()` gives the `AuthUser` (`id`, `role`, `studentId`, `teacherId`).
- **Ownership is checked in services through `AccessService`** (`src/access/`), the API's version of `apps/web/firestore.rules`: students see their own records and the events/posts of their audience (`audienceFor`); teachers write grades, attendance and class events only where they have a `TeachingAssignment` (`assertTeachesClass(user, classId, subjectId)`); `assertCanReadStudent` for anything about one student. A role check alone is never enough.
- Refresh tokens: opaque, in the `cdls_refresh` httpOnly SameSite=Strict cookie (path `/api/auth`), stored as an HMAC, rotated on each refresh; reuse revokes the family. Deactivating a user or changing their password calls `AuthService.revokeAll`.
- Never log passwords, tokens or full request bodies. Hash passwords with `argon2`. Login is limited to 5 attempts a minute.

## Database (Prisma)

- Dev database: `npm run db:dev` (from the repo root) runs PostgreSQL 18 from npm (embedded-postgres) on port 5433, data in `apps/api/.dev-db/` (gitignored), and writes `DATABASE_URL` into `apps/api/.env`. The alternative is the system PostgreSQL 18 with the `cdls` role and `cdls_dev` database (`prisma/setup-database.sql`, run once by the user as `postgres`). Never ask for, guess or store the `postgres` superuser password, and never touch the system PostgreSQL service.
- Use `PrismaService` (global `PrismaModule`); never `new PrismaClient()` in app code. The client is generated into `src/generated/prisma` (gitignored): `npm run prisma:generate`.
- Schema changes go through migrations: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`. Never edit an applied migration. Constraints Prisma can't express (CHECKs) go into the migration SQL (`--create-only`, edit, then migrate).
- **`prisma migrate reset` is refused for AI agents** (Prisma's own guard) and destroys data: don't run it or bypass the guard; ask the user. `npm run db:seed` wipes and re-seeds the dev database (fine for dev data; it regenerates the demo passwords in `demo-credentials.local.md`).
- snake_case tables and columns (`@@map` / `@map`), camelCase in TypeScript. Index every foreign key and common filter.
- Multi-step writes use `prisma.$transaction`. Avoid N+1 queries: `include`/`select` what you need.
- Grade changes write `AuditLog` rows in the same transaction (`common/audit.ts`).
- Pure domain logic (averages, calendar occurrences, audiences, .ics) lives in `packages/shared` and is imported from `@cdls/shared`, not re-implemented here. Keep the Prisma `EventKind` enum in sync with the shared one (`src/prisma/enums.spec.ts` checks it).

## Config

- All environment variables are declared and validated in `src/config/env.validation.ts`; add new ones there and to `.env.example` (placeholders only, never real secrets). Read them with `ConfigService<Env, true>`.

## Tests

- Unit tests (`src/**/*.spec.ts`) use the Nest testing module (`Test.createTestingModule`) and mock `PrismaService` and other services with `vi.fn()`. Keep pure computations (e.g. `report-cards/compute.ts`) in plain functions and test them directly.
- e2e tests (`test/*.e2e-spec.ts`) need the dev database server running. Each run creates its own throwaway database (`cdls_e2e_<random>`), applies migrations with `prisma migrate deploy`, seeds it with one random password, and drops it at the end (`test/global-setup.ts`). Use `createTestApp()` from `test/helpers.ts`; it logs in once per account because login is rate-limited (5 per minute per app).
- Every permission rule gets an e2e test (see `test/permissions.e2e-spec.ts`).
- `npm test` (unit), `npm run test:e2e`, `npm run lint` (oxlint, type-aware) must pass before a PR.
