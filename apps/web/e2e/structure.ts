import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { Account } from './accounts';

/** Shared helpers of the structure specs (admin screens of phase 1). */

export const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Axe at 390 and 1440 px, then back to the project's own viewport. */
export async function axeAtBothWidths(page: Page): Promise<void> {
  const original = page.viewportSize();
  for (const size of VIEWPORTS) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    await expectNoAxeViolations(page);
  }
  if (original) await page.setViewportSize(original);
}

/** Signs in and waits until the space has opened. */
export async function signInAs(page: Page, account: Account): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'));
  await page.locator('.app-bar').waitFor();
}

/** Opens a page through the router (the access token lives in memory); `path` may carry a query. */
export async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  const pathname = path.split('?')[0];
  await page.waitForURL((url) => url.pathname === pathname);
}

export async function tokenOf(request: APIRequestContext, account: Account): Promise<{ Authorization: string }> {
  const res = await request.post('/api/auth/login', { data: account });
  expect(res.ok()).toBeTruthy();
  return { Authorization: `Bearer ${((await res.json()) as { accessToken: string }).accessToken}` };
}

/** Letters only: unique on every run. */
export function unique(prefix: string): string {
  const letters = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  return `${prefix} ${letters}`;
}
