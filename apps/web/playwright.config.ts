import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack: `npm run db:dev`, `npm run db:seed`, `npm run dev`, then
 * `npm run e2e -w @cdls/web`. Demo accounts are read from apps/api/demo-credentials.local.md (gitignored).
 */
export default defineConfig({
  testDir: './e2e',
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
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
