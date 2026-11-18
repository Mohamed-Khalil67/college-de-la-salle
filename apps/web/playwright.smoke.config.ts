import { defineConfig, devices } from '@playwright/test';

/**
 * Any school pack's public pages (e2e/school-smoke.spec.ts), against the production build served like nginx does,
 * with no API or database: `SCHOOL=<id> npm run build`, then `SCHOOL=<id> npm run e2e:smoke -w @cdls/web`.
 * Port 4620 (E2E_SMOKE_PORT to change it).
 */
const port = Number(process.env['E2E_SMOKE_PORT'] ?? 4620);

export default defineConfig({
  testDir: './e2e',
  testMatch: 'school-smoke.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, locale: 'fr-FR', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/serve-static.mjs ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
  },
});
