import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack: `npm run db:dev`, `npm run db:seed`, `npm run dev`, then
 * `npm run e2e -w @cdls/web`. Demo accounts are read from apps/api/demo-credentials.local.md (gitignored).
 *
 * One test at a time: every test signs in with the same demo accounts and reads and writes the same demo
 * database, so two at once (two workers, or the desktop and phone projects side by side) step on each other's
 * sessions and data. `workers: 1` keeps one test at a time, and the phone project depends on the desktop one,
 * so it starts only once the desktop pass is over, whatever `--workers` says (it is skipped when a desktop
 * test failed; `--project=phone --no-deps` runs it alone).
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, dependencies: ['desktop'] },
  ],
});
