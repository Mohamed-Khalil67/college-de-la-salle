# apps/api — NestJS conventions

NestJS 12 (ESM), Prisma 7 with PostgreSQL 18 (native Windows service `postgresql-x64-18`, no Docker), Vitest. Read the `nestjs-best-practices` skill before larger changes.

## Layout

- One **feature module** per folder under `src/` (`auth/`, `users/`, `classes/`, `events/`, `grades/`…): `x.module.ts`, `x.controller.ts`, `x.service.ts`, `dto/`, and specs next to the code (`x.service.spec.ts`). Cross-cutting pieces live in `src/common/` (guards, decorators, filters, interceptors), config in `src/config/`, the database client in `src/prisma/`.
- Import feature modules into `AppModule`. A module exports only what other modules need. No circular imports between modules.
- ESM: relative imports end in `.js` (`import { X } from './x.service.js'`).

## Controllers, DTOs, validation

- Controllers stay thin: parse the request, call a service, return a DTO. **No business logic or Prisma calls in controllers.**
- Every body, query and param is a DTO class validated with `class-validator` (the global `ValidationPipe` uses `whitelist`, `forbidNonWhitelisted` and `transform`). Never accept a raw object.
- Return response DTOs, never Prisma models directly (no `passwordHash` leaks). Document endpoints with `@nestjs/swagger` decorators (`@ApiTags`, `@ApiOkResponse`…); the docs are at `/api/docs`.
- Throw Nest HTTP exceptions (`NotFoundException`, `ForbiddenException`…) from services; never return error objects.
- List endpoints are paginated (`take`/`skip` or cursor, with a max page size).

## Auth and roles

- Roles are `admin | teacher | student` (Prisma `Role`). Protect routes with guards: an auth guard for the JWT, a `RolesGuard` with a `@Roles()` decorator, and **ownership checks in services** (a student reads only their own grades; a teacher edits only the classes in their `TeachingAssignment`s). `apps/web/firestore.rules` is the written spec of who may do what.
- Never log passwords, tokens or full request bodies. Hash passwords with `argon2`.

## Database (Prisma)

- Local dev database: `cdls_dev`, owned by the `cdls` role (`prisma/setup-database.sql`, run once by the user as `postgres`). The URL is in `apps/api/.env` (gitignored). Never ask for, guess or store the `postgres` superuser password.
- Use `PrismaService` (global `PrismaModule`); never `new PrismaClient()` in app code. The client is generated into `src/generated/prisma` (gitignored): `npm run prisma:generate`.
- Schema changes go through migrations: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`. Never edit an applied migration.
- snake_case tables and columns (`@@map` / `@map`), camelCase in TypeScript. Index every foreign key and common filter.
- Multi-step writes use `prisma.$transaction`. Avoid N+1 queries: `include`/`select` what you need.
- Grade changes write an `AuditLog` row in the same transaction.
- Pure domain logic (averages, calendar expansion, audiences) lives in `packages/shared` and is imported from `@cdls/shared`, not re-implemented here. Keep the Prisma `EventKind` enum in sync with the shared one (`src/prisma/enums.spec.ts` checks it).

## Config

- All environment variables are declared and validated in `src/config/env.validation.ts`; add new ones there and to `.env.example` (placeholders only, never real secrets). Read them with `ConfigService<Env, true>`.

## Tests

- Unit tests use the Nest testing module (`Test.createTestingModule`) and mock `PrismaService` and other external services with `vi.fn()`.
- e2e tests (`test/*.e2e-spec.ts`) boot `AppModule` with `configureApp()` from `src/app.setup.ts` and call it with `supertest`.
- `npm test` (unit), `npm run test:e2e`, `npm run lint` (oxlint, type-aware) must pass before a PR.
