import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite. Needs the Firebase emulators (auth, firestore, functions):
 *
 *   npm run test:e2e          # starts emulators + dev server, runs, tears down
 *
 * or, with `npm run emulators` already running: npx playwright test
 */
/** Override to test a dev server on another port, e.g. E2E_BASE_URL=http://localhost:4201. */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'ar',
    colorScheme: 'light',
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
