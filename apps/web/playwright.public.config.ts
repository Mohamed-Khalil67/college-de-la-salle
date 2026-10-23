import { defineConfig, devices } from '@playwright/test';

/**
 * The public site only (e2e/public-site.spec.ts), against the production build served like nginx does, with no
 * API or database: `npm run build`, then `npm run e2e:public -w @cdls/web`. Port 4610 (E2E_PUBLIC_PORT to change it).
 */
const port = Number(process.env['E2E_PUBLIC_PORT'] ?? 4610);

export default defineConfig({
  testDir: './e2e',
  testMatch: 'public-site.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, locale: 'fr-FR', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/serve-static.mjs ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: true,
  },
});
