import { createTestApp, type TestApp } from './helpers.js';

describe('App (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('GET /api/health answers ok without a token', () =>
    t.http().get('/api/health').expect(200, { status: 'ok' }));

  it('GET /api/health/db reaches the database', () =>
    t.http().get('/api/health/db').expect(200, { status: 'ok' }));

  it('GET /api/health/db is not reachable through the reverse proxy', async () => {
    await t.http().get('/api/health/db').set('X-Forwarded-For', '203.0.113.7').expect(404);
    await t.http().get('/api/health/db').set('X-Real-IP', '203.0.113.7').expect(404);
    // The liveness check stays public behind the proxy.
    await t.http().get('/api/health').set('X-Forwarded-For', '203.0.113.7').expect(200);
  });

  it('every other route needs a token', () => t.http().get('/api/classes').expect(401));

  it('sets security headers', async () => {
    const res = await t.http().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves the OpenAPI document with every feature', async () => {
    const res = await t.http().get('/api/docs-json').expect(200);
    const paths = Object.keys((res.body as { paths: Record<string, unknown> }).paths);
    for (const path of [
      '/api/auth/login',
      '/api/users/import',
      '/api/users/import/preview',
      '/api/users/archive',
      '/api/auth/password',
      '/api/section-changes/{id}/approve',
      '/api/classes/{id}/students',
      '/api/events/occurrences',
      '/api/events/{id}/grades',
      '/api/events/{id}/attendance',
      '/api/homework',
      '/api/posts',
      '/api/periods/{id}/report-cards/generate',
      '/api/subjects',
      '/api/classes/{id}/subjects',
      '/api/class-subjects/{id}',
      '/api/rooms',
      '/api/activity-types',
      '/api/activity-types/{id}/promote',
      '/api/periods/{id}',
      '/api/school-years/{id}/periods',
      '/api/calendar-days',
      '/api/report-cards/{id}/pdf',
    ]) {
      expect(paths).toContain(path);
    }
  });
});
