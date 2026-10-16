import { type Browser, expect, type Page } from '@playwright/test';

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
 * Layout and script integrity for an Arabic page:
 *  - document is `lang="ar" dir="rtl"`, and the content actually resolves to RTL;
 *  - nothing overflows horizontally (the classic symptom of a physical left/right rule);
 *  - no U+FFFD replacement characters (encoding / font corruption);
 *  - the Arabic faces are loaded and display text has diacritic-safe line-height.
 */
async function assertRtlIntegrity(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

  const report = await page.evaluate(async () => {
    await document.fonts.ready;
    const main = document.querySelector('main')!;
    const heading = document.querySelector('h1, h2');
    const headingStyle = heading ? getComputedStyle(heading) : null;
    return {
      direction: getComputedStyle(main).direction,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      replacementChars: document.body.innerText.includes('�'),
      amiri: document.fonts.check('700 24px Amiri', 'مِنَصَّة'),
      plexArabic: document.fonts.check('16px "IBM Plex Sans Arabic"', 'اختبار'),
      headingLeading: headingStyle
        ? parseFloat(headingStyle.lineHeight) / parseFloat(headingStyle.fontSize)
        : 2,
    };
  });

  expect(report.direction).toBe('rtl');
  expect(report.overflowX).toBeLessThanOrEqual(1);
  expect(report.replacementChars).toBe(false);
  expect(report.amiri).toBe(true);
  expect(report.plexArabic).toBe(true);
  expect(report.headingLeading).toBeGreaterThanOrEqual(1.5);
}

/**
 * Fails on any Latin word in interface copy or accessibility text. User-authored content is
 * exempt because the app marks it: examIsolate (.bidi-isolate), <bdi>, <code>, and .ltr fields.
 */
async function assertNoUntranslatedText(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const USER_CONTENT = '.bidi-isolate, bdi, code, .ltr, script, style, noscript, template';
    const ALLOWED = /\bGoogle\b/g;
    const latin = (text: string) => /[A-Za-z]{2,}/.test(text.replace(ALLOWED, ''));
    const found: string[] = [];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent?.trim() ?? '';
      if (!text || node.parentElement?.closest(USER_CONTENT)) continue;
      if (latin(text)) found.push(`text: "${text.slice(0, 80)}"`);
    }
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.closest(USER_CONTENT)) continue;
      for (const attr of ['placeholder', 'aria-label', 'title', 'alt']) {
        const value = el.getAttribute(attr);
        if (value && latin(value)) found.push(`${el.tagName.toLowerCase()}[${attr}]: "${value}"`);
      }
    }
    return found;
  });
  expect(offenders, `Untranslated text on ${page.url()}`).toEqual([]);
}
