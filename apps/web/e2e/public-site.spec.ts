import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { LANG_META, LANGS, type Lang } from '../src/app/i18n/lang';
import { MESSAGES_AR } from '../src/app/i18n/messages.ar';
import { MESSAGES_EN } from '../src/app/i18n/messages.en';
import { MESSAGES_FR } from '../src/app/i18n/messages.fr';
import { pageUrl, PRERENDERED_PAGES, PUBLIC_PAGES, type PublicPageId } from '../src/app/i18n/pages';

/**
 * The public site in French, English and Arabic: every page opens with the right language and direction, has
 * one h1, passes Axe at 390 and 1440 px, and links to itself in the other languages. Needs no database: run it
 * against the production build (`npm run e2e:public`, static server on :4610 that answers 401 to /api) or
 * against `npm run dev`.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'checked at both widths inside each test');
});

const MESSAGES = { fr: MESSAGES_FR, en: MESSAGES_EN, ar: MESSAGES_AR } as const;
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

/** Console errors, except the expected 401 of the session check (a visitor is not signed in). */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function expectLanguage(page: Page, lang: Lang): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await expect(page.locator('html')).toHaveAttribute('dir', LANG_META[lang].dir);
}

for (const lang of LANGS) {
  const t = MESSAGES[lang];
  for (const id of PUBLIC_PAGES) {
    const url = pageUrl(lang, id);
    test(`${lang} ${url}: language, one h1, title, Axe at 390 and 1440 px`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto(url);
      await expectLanguage(page, lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const title = t.pages[id].title;
      await expect(page).toHaveTitle(title ? `${title} — ${LANG_META[lang].siteTitle}` : LANG_META[lang].homeTitle);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', t.pages[id].description);
      await axeAtBothWidths(page, url);
      if (id === 'login') {
        // The sign-in page carries its own language switcher (it has no site header).
        await expect(page.getByRole('navigation', { name: t.layout.languages })).toBeVisible();
        // The errors a visitor sees after an empty submit are in the page's language, and still pass Axe.
        await page.getByRole('button', { name: t.login.submit }).click();
        await expect(page.getByText(t.login.errors.emailRequired)).toBeVisible();
        await axeAtBothWidths(page, `${url} with errors`);
      }
      expect(errors, 'console errors').toEqual([]);
    });
  }
}

test('each public page is prerendered in each language, with its hreflang links', async ({ request }) => {
  for (const lang of LANGS) {
    for (const id of PRERENDERED_PAGES) {
      const url = pageUrl(lang, id);
      const html = await (await request.get(url)).text();
      expect(html, url).toContain(`<html lang="${lang}" dir="${LANG_META[lang].dir}"`);
      expect(html, url).toContain(`<h1`);
      for (const other of LANGS) {
        expect(html, `${url} → ${other}`).toMatch(new RegExp(`hreflang="${other}" href="[^"]*${pageUrl(other, id)}"`));
      }
      expect(html, url).toContain('hreflang="x-default"');
    }
  }
});

test('the language switcher keeps the page and turns the layout right to left', async ({ page }) => {
  await page.goto('/histoire');
  const switcher = page.getByRole('navigation', { name: MESSAGES_FR.layout.languages });
  await expect(switcher.getByRole('link', { name: 'Français' })).toHaveAttribute('aria-current', 'true');
  await switcher.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/history$/);
  await expectLanguage(page, 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(MESSAGES_EN.history.title);

  await page.getByRole('navigation', { name: MESSAGES_EN.layout.languages }).getByRole('link', { name: 'العربية' }).click();
  await expect(page).toHaveURL(/\/ar\/history$/);
  await expectLanguage(page, 'ar');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(MESSAGES_AR.history.title);
  // The Arabic text is set in Cairo, and the page reads from the right.
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Cairo/);
  const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(h1!.x + h1!.width).toBeGreaterThan((page.viewportSize()?.width ?? 0) / 2);

  // Leaving the Arabic site for a French page puts the document back in French, left to right.
  await page.goto('/ar/login');
  await expectLanguage(page, 'ar');
  await page.getByRole('link', { name: MESSAGES_AR.login.forgot }).click();
  await expect(page).toHaveURL(/\/connexion\/oubli$/);
  await expectLanguage(page, 'fr');
});

test('« Vous êtes… » sends each visitor to the right place, in each language', async ({ page }) => {
  for (const lang of LANGS) {
    const t = MESSAGES[lang];
    await page.goto(pageUrl(lang, 'home'));
    const band = page.getByRole('region', { name: t.home.audienceTitle });
    for (const audience of t.home.audiences) {
      await expect(band.getByRole('link', { name: audience.title })).toHaveAttribute('href', pageUrl(lang, audience.page));
    }
  }
  await page.goto('/');
  await page
    .getByRole('region', { name: MESSAGES_FR.home.audienceTitle })
    .getByRole('link', { name: MESSAGES_FR.home.audiences[0].title })
    .click();
  await expect(page).toHaveURL(/\/contact$/);
});

test('every page links to the accessibility statement in its own language', async ({ page }) => {
  for (const lang of LANGS) {
    await page.goto(pageUrl(lang, 'contact'));
    await page.getByRole('contentinfo').getByRole('link', { name: MESSAGES[lang].layout.accessibility }).click();
    await expect(page).toHaveURL(new RegExp(`${pageUrl(lang, 'accessibility')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MESSAGES[lang].accessibility.title);
  }
});

test('keyboard: skip link, phone menu and Escape, in Arabic', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ar/contact');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: MESSAGES_AR.layout.skipToContent });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();

  const toggle = page.getByRole('button', { name: MESSAGES_AR.layout.menu });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const nav = page.getByRole('navigation', { name: MESSAGES_AR.layout.mainNav });
  await expect(nav.getByRole('link', { name: MESSAGES_AR.layout.nav.history })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('the contact form speaks the page’s language but sends the French subject the office reads', async ({ page }) => {
  let sent: unknown = null;
  await page.route('**/api/contact', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.goto('/en/contact');
  const t = MESSAGES_EN.contactForm;
  const form = page.getByRole('form', { name: t.title });
  await form.getByRole('button', { name: t.send }).click();
  await expect(form.getByText(t.errors.nameRequired)).toBeVisible();
  await form.getByLabel(t.name).fill('Test Parent');
  await form.getByLabel(t.email).fill('parent@example.com');
  await form.getByLabel(t.subject).selectOption({ label: t.subjects.schooling });
  await form.getByLabel(t.message).fill('Hello');
  await form.getByRole('button', { name: t.send }).click();
  await expect(form.getByText(t.sent.before)).toBeVisible();
  expect(sent).toMatchObject({ subject: 'Scolarité d’un élève', name: 'Test Parent' });
});

/** Page ids are typed: a page added to PUBLIC_PAGES without a route fails here. */
test('every public page id resolves in every language', async ({ page }) => {
  const ids: readonly PublicPageId[] = PUBLIC_PAGES;
  for (const lang of LANGS) {
    for (const id of ids) {
      await page.goto(pageUrl(lang, id));
      await expect(page).toHaveURL(new RegExp(`${pageUrl(lang, id).replace(/\/$/, '')}/?$`));
    }
  }
});
