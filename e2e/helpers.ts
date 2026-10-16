import { type Browser, expect, type Page } from '@playwright/test';

const PAGE_IDS = ['home', 'history', 'arabe', 'mathematiques', 'physique-chimie'];

/** Deletes teacher edits (Firestore emulator, owner token) so pages show the bundled content again. */
export async function resetContent(): Promise<void> {
  const host = process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080';
  for (const id of PAGE_IDS) {
    await fetch(`http://${host}/v1/projects/demo-exam-platform/databases/(default)/documents/content_pages/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner' },
    });
  }
}

export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: 'ar', colorScheme: 'light' });
  return context.newPage();
}

export async function signInExaminer(page: Page, tag: string): Promise<void> {
  await page.goto('/sign-in');
  await checkPage(page);
  await page.getByLabel('البريد الإلكتروني').fill(`e2e-${tag}-${Date.now()}@example.test`);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page).toHaveURL(/\/examiner$/);
  await expect(page.getByRole('heading', { name: 'الاختبارات والنتائج المباشرة' })).toBeVisible();
}

/** Emulator sign-in with any address; the server-side allow-list decides the role. */
export async function signInAs(page: Page, email: string, name: string): Promise<void> {
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel(/الاسم الظاهر/).fill(name);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
}

export async function checkPage(page: Page): Promise<void> {
  await assertRtlIntegrity(page);
  await assertNoUntranslatedText(page);
}

/**
 * Layout and script integrity for a page, in whichever language it declares:
 *  - `html[lang]` is `ar` (dir rtl) or `fr` (dir ltr), and the content resolves to that direction;
 *  - nothing overflows horizontally (the classic symptom of a physical left/right rule);
 *  - no U+FFFD replacement characters (encoding / font corruption);
 *  - the right face is loaded: Cairo on Arabic pages, Inter on French pages, with a line-height
 *    that keeps Arabic diacritics from clipping.
 */
export async function assertRtlIntegrity(page: Page): Promise<void> {
  const lang = await page.locator('html').getAttribute('lang');
  expect(['ar', 'fr']).toContain(lang);
  const dir = lang === 'fr' ? 'ltr' : 'rtl';
  await expect(page.locator('html')).toHaveAttribute('dir', dir);

  const report = await page.evaluate(async (isFrench) => {
    await document.fonts.ready;
    const main = document.querySelector('main')!;
    const heading = document.querySelector('main h1, main h2');
    const headingStyle = heading ? getComputedStyle(heading) : null;
    return {
      direction: getComputedStyle(main).direction,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      replacementChars: document.body.innerText.includes('�'),
      face: isFrench
        ? document.fonts.check('16px "Inter Variable"', 'Mathématiques')
        : document.fonts.check('400 16px Cairo', 'اختبار'),
      headingFont: headingStyle?.fontFamily.split(',')[0]?.replace(/["']/g, '').trim() ?? null,
      headingLeading: headingStyle
        ? parseFloat(headingStyle.lineHeight) / parseFloat(headingStyle.fontSize)
        : 2,
    };
  }, lang === 'fr');

  expect(report.direction).toBe(dir);
  expect(report.overflowX).toBeLessThanOrEqual(1);
  expect(report.replacementChars).toBe(false);
  expect(report.face).toBe(true);
  if (report.headingFont !== null) expect(report.headingFont).toBe(lang === 'fr' ? 'Inter Variable' : 'Cairo');
  expect(report.headingLeading).toBeGreaterThanOrEqual(lang === 'fr' ? 1.2 : 1.5);
}

/**
 * Fails on any Latin word in Arabic interface copy or accessibility text. Exempt: user-authored
 * content (examIsolate / <bdi> / <code> / .ltr) and anything the page itself marks as French
 * (`lang="fr"` on an element below <html>: the French nav items, the French <main>, the school name).
 */
export async function assertNoUntranslatedText(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const EXEMPT = '.bidi-isolate, bdi, code, .ltr, [lang="fr"]:not(html), script, style, noscript, template';
    const ALLOWED = /\bGoogle\b/g;
    const latin = (text: string) => /[A-Za-z]{2,}/.test(text.replace(ALLOWED, ''));
    const found: string[] = [];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent?.trim() ?? '';
      if (!text || node.parentElement?.closest(EXEMPT)) continue;
      if (latin(text)) found.push(`text: "${text.slice(0, 80)}"`);
    }
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.closest(EXEMPT)) continue;
      for (const attr of ['placeholder', 'aria-label', 'title', 'alt']) {
        const value = el.getAttribute(attr);
        if (value && latin(value)) found.push(`${el.tagName.toLowerCase()}[${attr}]: "${value}"`);
      }
    }
    return found;
  });
  expect(offenders, `Untranslated text on ${page.url()}`).toEqual([]);
}