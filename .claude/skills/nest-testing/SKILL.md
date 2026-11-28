---
name: nest-testing
description: Writes and fixes NestJS tests - unit tests with Test.createTestingModule and overrideProvider, e2e tests with supertest against a real app, a real Postgres through Testcontainers, test data factories, and testing guards and validation. Use when adding tests to a NestJS service or controller, a test needs a database, mocks are getting complicated, a guard blocks tests, or the user says write tests, add e2e tests, or tests are flaky.
---

# NestJS testing

## Pick the runner the project already uses
Read `package.json`: Vitest (`vi.fn()`, default in new NestJS 12 ESM projects) or Jest (`jest.fn()`, CommonJS projects). Do not add a second runner. In ESM projects keep the `.js` extension on relative imports in tests too.

## Unit tests: one class, its dependencies faked
```ts
const moduleRef = await Test.createTestingModule({ providers: [CoursesService, { provide: CoursesRepository, useValue: repo }] }).compile();
const service = moduleRef.get(CoursesService);
```
- Fake only what crosses a boundary (repository, HTTP client, queue, clock). Do not mock the class under test or plain helpers.
- Assert on behaviour (returned value, thrown `NotFoundException`, the call made to the repository), not on private state.

## E2E tests: the real app over HTTP
```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(PaymentsClient).useValue(fakePayments)
  .compile();
app = moduleRef.createNestApplication();
await app.init();
await request(app.getHttpServer()).post('/courses').send(dto).expect(201);
// afterAll: await app.close();
```
- `createNestApplication()` does not run `main.ts`. Global pipes, guards and filters must be registered as `APP_*` providers in a module (see `nestjs-core`) or the e2e app silently skips them.
- Override external services, never the database: e2e tests should hit real SQL.

## Real database
- Use Testcontainers (`@testcontainers/postgresql`) to start Postgres once per test run, run the migrations, and point the app at it. Same major version as production.
- Isolate tests: wrap each test in a transaction that rolls back, or truncate the touched tables in `beforeEach`. Never depend on test order.

## Test data
- Small factory functions (`makeCourse({ title: 'x' })`) with sensible defaults; override only what the test is about. No shared mutable fixtures.

## Guards and validation
- A global guard registered with `{ provide: APP_GUARD, useExisting: JwtAuthGuard }` plus `JwtAuthGuard` in `providers` can be replaced with `.overrideProvider(JwtAuthGuard).useClass(FakeAuthGuard)`. With `useClass` on the token it cannot.
- Test that protected routes return 401 without a token and 403 with the wrong role, and that an invalid body returns 400 with the field named.

## Done when
- New code has unit tests for its logic and an e2e test for each new endpoint (happy path, validation error, auth failure).
- The suite passes twice in a row and in a random order.
