import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_LANG, LANG_META, siteTitle } from '../src/app/i18n/lang';
import { SITE } from '../src/app/school/active/index';
import { FR } from '../src/app/i18n/fr';
import { pageUrl, PRERENDERED_PAGES, PUBLIC_PAGES, type PublicPageId } from '../src/app/i18n/pages';
import { PROFILE } from '../src/app/core/school/school-profile';

/**
 * The public site (French only, docs/i18n.md): every page opens with the right language and direction, has one h1,
 * passes Axe at 390 and 1440 px, and carries its canonical link. Needs no database: run it against the production
 * build (`npm run e2e:public`, static server on :4610 that answers 401 to /api) or against `npm run dev`.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at both widths inside each test');
});

const t = FR.messages;
const lang = DEFAULT_LANG;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function axeAtBothWidths(page: Page, where: string): Promise<void> {
  for (const size of VIEWPORTS) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      `Axe on ${where} at ${size.width} px`,
    ).toEqual([]);
  }
}

/**
 * Console errors and Angular warnings (NG02952 aspect ratio, NG02960 oversized image…). No 401 is expected any
 * more: without the session marker cookie the page does not ask POST /api/auth/refresh (finding 18).
 */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /NG0\d+/.test(m.text()))) errors.push(m.text());
  });
  page.on('request', (r) => {
    if (r.url().includes('/api/auth/refresh')) errors.push(`unexpected session check ${r.method()} ${r.url()}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

for (const id of PUBLIC_PAGES) {
  const url = pageUrl(lang, id);
  test(`${url}: language, one h1, title, Axe at 390 and 1440 px`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('html')).toHaveAttribute('dir', LANG_META[lang].dir);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const title = t.pages[id].title;
    await expect(page).toHaveTitle(title ? `${title} — ${siteTitle(lang)}` : SITE.homeTitle[lang]);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', t.pages[id].description);
    await axeAtBothWidths(page, url);
    if (id === 'login') {
      // The errors a visitor sees after an empty submit are in French, and still pass Axe.
      await page.getByRole('button', { name: t.login.submit }).click();
      await expect(page.getByText(t.login.errors.emailRequired)).toBeVisible();
      await axeAtBothWidths(page, `${url} with errors`);
    }
    expect(errors, 'console errors').toEqual([]);
  });
}

test('each public page is prerendered in French, with its canonical link and no alternate language', async ({ request }) => {
  const origin = PROFILE.siteUrl;
  for (const id of PRERENDERED_PAGES) {
    const url = pageUrl(lang, id);
    const html = await (await request.get(url)).text();
    expect(html, url).toContain(`<html lang="${lang}" dir="${LANG_META[lang].dir}"`);
    expect(html, url).toContain(`<h1`);
    expect(html, url).toContain(`<link rel="canonical" href="${origin}${url}"`);
    expect(html, url).not.toContain('hreflang');
  }
});

test('robots.txt keeps crawlers out of the spaces and names the sitemap of every prerendered page', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  // The dev server answers the page for an unknown path: robots.txt exists only in the build (postbuild), and
  // `npm run e2e:public` (the static build) checks it.
  test.skip(!robots.headers()['content-type']?.includes('text/plain'), 'robots.txt is written by the build: run e2e:public');
  expect(robots.headers()['content-type']).toContain('text/plain');
  const text = await robots.text();
  expect(text).toMatch(/^User-agent: \*$/m);
  for (const path of ['/api/', '/connexion', '/eleve', '/enseignant', '/admin']) expect(text).toContain(`Disallow: ${path}`);
  expect(text).toContain(`Sitemap: ${PROFILE.siteUrl}/sitemap.xml`);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const id of PRERENDERED_PAGES) expect(sitemap).toContain(`<loc>${PROFILE.siteUrl}${pageUrl(lang, id)}</loc>`);
  expect(sitemap).not.toContain('connexion');
  expect(sitemap).not.toContain('/en/');
});

test('an anonymous visit sends no session check, and phones get the small photo', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(asked.filter((u) => u.includes('/api/'))).toEqual([]);
  // The hero photo comes from the srcset of WebP copies, not the full-size original.
  const hero = await page.locator('.hero__media').evaluate((img: HTMLImageElement) => img.currentSrc);
  expect(hero, 'hero photo').not.toMatch(/\.(?:jpe?g|png)$/);
});

test('« Vous êtes… » sends each visitor to the right place', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: t.home.audienceTitle })
    .getByRole('link', { name: t.home.audiences[0].title })
    .click();
  await expect(page).toHaveURL(/\/contact$/);
});

test('every page links to the accessibility statement', async ({ page }) => {
  await page.goto(pageUrl(lang, 'contact'));
  await page.getByRole('contentinfo').getByRole('link', { name: t.layout.accessibility }).click();
  await expect(page).toHaveURL(new RegExp(`${pageUrl(lang, 'accessibility')}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.accessibility.title);
});

test('keyboard: skip link, phone menu and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl(lang, 'contact'));
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: t.layout.skipToContent });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();

  const toggle = page.getByRole('button', { name: t.layout.menu });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const nav = page.getByRole('navigation', { name: t.layout.mainNav });
  await expect(nav.getByRole('link', { name: t.layout.nav.history })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('the contact form sends the French subject the office reads', async ({ page }) => {
  let sent: unknown = null;
  await page.route('**/api/contact', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.goto(pageUrl(lang, 'contact'));
  const form = page.getByRole('form', { name: t.contactForm.title });
  // The prerendered form is inert until Angular has hydrated it: its send button is disabled until then.
  await expect(form.getByRole('button', { name: t.contactForm.send })).toBeEnabled();
  await form.getByRole('button', { name: t.contactForm.send }).click();
  await expect(form.getByText(t.contactForm.errors.nameRequired)).toBeVisible();
  await form.getByLabel(t.contactForm.name).fill('Test Parent');
  await form.getByLabel(t.contactForm.email).fill('parent@example.com');
  await form.getByLabel(t.contactForm.subject).selectOption({ label: t.contactForm.subjects.schooling });
  await form.getByLabel(t.contactForm.message).fill('Hello');
  await form.getByRole('button', { name: t.contactForm.send }).click();
  await expect(form.getByText(t.contactForm.sent.before)).toBeVisible();
  expect(sent).toMatchObject({ subject: 'Scolarité d’un élève', name: 'Test Parent' });
});

/**
 * The prerendered form must not be submittable before Angular has hydrated it: with the scripts held back, the
 * send button is disabled, so neither a click nor Enter in a field can submit the form natively (which would
 * reload the page with the typed text in the address and lose the message).
 */
test('the contact form cannot be submitted before the page is hydrated', async ({ page }) => {
  let release = () => {};
  const scriptsHeld = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/*.js', async (route) => {
    await scriptsHeld;
    await route.continue();
  });
  let navigations = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest()) navigations++;
  });
  await page.goto(pageUrl(lang, 'contact'), { waitUntil: 'commit' });
  const form = page.getByRole('form', { name: t.contactForm.title });
  const send = form.getByRole('button', { name: t.contactForm.send });
  await expect(send).toBeDisabled();
  await form.getByLabel(t.contactForm.name).focus();
  await page.keyboard.press('Enter');
  release();
  await expect(send).toBeEnabled();
  // A native submit would have reloaded the page, and the address would carry the form's fields.
  expect(new URL(page.url()).search).toBe('');
  expect(navigations).toBe(1);
});

/** Page ids are typed: a page added to PUBLIC_PAGES without a route fails here. */
test('every public page id resolves', async ({ page }) => {
  const ids: readonly PublicPageId[] = PUBLIC_PAGES;
  for (const id of ids) {
    await page.goto(pageUrl(lang, id));
    await expect(page).toHaveURL(new RegExp(`${pageUrl(lang, id).replace(/\/$/, '')}/?$`));
  }
});
