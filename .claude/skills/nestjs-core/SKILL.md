---
name: nestjs-core
description: Sets up and fixes the core of a NestJS 11 or 12 app - bootstrap in main.ts, global validation, typed and validated configuration, security middleware, rate limiting, graceful shutdown, Express 5 routes, and CommonJS vs ESM imports. Use when creating a NestJS app or module, editing main.ts or app.module.ts, adding config or env variables, a route wildcard stops matching, imports fail after an upgrade, or the user says set up NestJS, add validation, add rate limiting, or upgrade NestJS.
---

# NestJS core setup

For rules on module design, DI, errors and performance, use `nestjs-best-practices`. This skill covers the app-wide wiring that every NestJS project needs once.

## 1. Detect the version and module format first
Read `package.json` before writing code:
- `@nestjs/core` major: 11 needs Node 20+; 12 needs Node 20.19+ or 22.12+.
- `"type": "module"` means ESM: relative imports need the `.js` extension (`import { AppModule } from './app.module.js'`), and `__dirname` becomes `import.meta.dirname`. Without it the project is CommonJS: no extensions. Never switch the module format as a side effect of another task; it is a project-wide change.
- Test runner: Vitest in new v12 ESM projects, Jest in CommonJS ones. Use whichever is installed.

## 2. Bootstrap (main.ts)
```ts
const app = await NestFactory.create(AppModule);
app.use(helmet());
app.enableShutdownHooks(); // lets OnModuleDestroy / OnApplicationShutdown run on SIGTERM
await app.listen(process.env.PORT ?? 3000);
```
- Register global pipes, guards and filters as providers (`APP_PIPE`, `APP_GUARD`, `APP_FILTER`) in `AppModule`, not with `app.useGlobal*()`, so they can inject dependencies and be overridden in tests.
- CORS: `app.enableCors({ origin: [...] })` with an explicit list. Never `origin: true` with credentials.

## 3. Validation: one global pipe
```ts
{ provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }) }
```
- `whitelist` strips undeclared properties; `forbidNonWhitelisted` rejects them with 400 instead; `transform` gives you DTO instances and converted primitives.
- Every body, query and param has a DTO with `class-validator` decorators. Never accept `any` or a plain object.

## 4. Configuration: validated at startup
```ts
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: z.object({ DATABASE_URL: z.url(), PORT: z.coerce.number().default(3000) }),
})
```
- The app must refuse to start with a missing or malformed variable. Use the schema library already in the project (Zod or Joi). With Joi 18+, library options go under `validationOptions.libraryOptions`.
- Read config through `ConfigService` (typed with `get<T>(key, { infer: true })` or a namespaced `registerAs` config), not `process.env` scattered in services.
- Never commit `.env`; keep a `.env.example` with every key and no secrets.

## 5. Rate limiting
`ThrottlerModule.forRoot([{ name: 'default', ttl: minutes(1), limit: 100 }])` plus `{ provide: APP_GUARD, useClass: ThrottlerGuard }`, registered before the auth guard. Add a stricter named throttler for login, sign-up and password reset.

## 6. Routes on Express 5
Name wildcards: `@Get('files/*path')`, optional `'files/{*path}'`. Nest still converts a bare `*`, but new code uses the named form.

## 7. Docs
Every page of the official docs exists as Markdown: `https://docs.nestjs.com/<path>.md` (for example `/techniques/configuration.md`), indexed in `https://docs.nestjs.com/llms.txt`. Read the relevant page before using an API you are unsure of, and follow the migration guide (`/migration-guide.md`) for upgrades.

## Done when
- The app starts, and fails fast with a clear message when a required variable is removed.
- A request with an unknown body property gets 400.
- The project's build, lint and tests pass.
