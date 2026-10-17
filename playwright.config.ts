import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite for the static site (no backend needed):
 *
 *   npm run test:e2e          # starts the dev server if needed, runs on desktop and mobile
 */
/** Override to test a dev server on another port, e.g. E2E_BASE_URL=http://localhost:4201. */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'ar',
    colorScheme: 'light',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
