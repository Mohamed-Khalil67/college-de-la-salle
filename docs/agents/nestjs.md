<!-- ai-skills: managed file. Re-running the installer updates it; put project-specific rules in your own docs. -->
# NestJS conventions

Only use an API the project's NestJS version supports (check `@nestjs/core` in `package.json`). Types: see [typescript.md](typescript.md). Finishing: see [delivery.md](delivery.md).

## Structure
- One feature module per domain area (`courses/`, `applications/`), each with its controller, service, DTOs and data access. No `services/` or `controllers/` folders across features.
- Controllers stay thin: parse and validate input (DTOs), call one service method, return a response DTO. Business rules live in services.
- Constructor injection only. Export from a module only what other modules use.

## Input and output
- Every body, query and param is a DTO validated by the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- Never return an ORM entity from a controller; map it to a response DTO.
- Errors: throw Nest's HTTP exceptions (`NotFoundException`, `ConflictException`) from services; one global exception filter shapes the body. Never swallow an error or return `null` for "not found".

## Configuration and secrets
- All settings come from `ConfigService`, validated at startup. No `process.env` reads inside services. No secrets in code, logs or tests.

## Data
- Schema changes only through migrations, never `synchronize: true` outside throwaway local databases.
- Multi-step writes run in one transaction. Watch for N+1 queries when loading relations.

## Logging
- Use Nest's `Logger` (or the project's pino logger) with context; log ids, never passwords, tokens or full request bodies.
