import { expect, type Page, test } from '@playwright/test';
import { checkPage, newPage, signInExaminer } from './helpers';

/*
 * Public portal: from the Collège de la Salle landing page, through the «الأقسام» dropdown, into the
 * Arabic section and a timed Arabic practice exam. Also proves the prerendered pages don't shift
 * while loading (CLS) and that mixed Arabic/French/Latin text keeps its reading order.
 */

const ARABIC_CLOCK = /^⁦[٠-٩]{2}:[٠-٩]{2}⁩$/;
const SCHOOL = 'Collège de la Salle';

/** Cumulative Layout Shift, recorded from the very first paint (installed before navigation). */
async function trackLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function settledLayoutShift(page: Page): Promise<number> {
  // Not 'networkidle': subject pages keep a live Firestore stream open by design.
  await page.waitForLoadState('load');
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return (window as unknown as { __cls: number }).__cls;
  });
}

test('landing page → «الأقسام» dropdown → Arabic section → timed Arabic practice exam', async ({ browser }, testInfo) => {
  const title = `تدريب النحو — ${testInfo.project.name} ${Date.now()}`;

  /* -------------------------------------------- An examiner lists a practice exam on the Arabic hub */
  const examiner = await newPage(browser);
  await signInExaminer(examiner, `portal-${testInfo.project.name}`);
  await examiner.getByRole('link', { name: 'اختبار جديد' }).click();
  await examiner.getByLabel('عنوان الاختبار').fill(title);
  await examiner.getByLabel('نصّ السؤال', { exact: true }).first().fill('ما إعراب «الطالبُ» في: الطالبُ مجتهدٌ؟');
  await examiner.getByLabel('نصّ الخيار 1', { exact: true }).fill('مبتدأ مرفوع');
  await examiner.getByLabel('نصّ الخيار 2', { exact: true }).fill('خبر مرفوع');
  await examiner.getByLabel('تحديد الخيار 1 إجابةً صحيحة').check();
  await examiner.getByLabel('المادة الدراسية').selectOption('arabic');
  await examiner.getByLabel(/عرضه في صفحة المادة/).check();
  await examiner.getByRole('button', { name: 'نشر الاختبار' }).click();
  await expect(examiner.getByRole('heading', { name: 'شارِك الاختبار مع المُختبَرين' })).toBeVisible();

  /* -------------------------------------------- A visitor lands on the prerendered home page */
  const visitor = await newPage(browser);
  await trackLayoutShift(visitor);
  await visitor.goto('/');
  await expect(visitor.getByRole('heading', { level: 1 })).toContainText(SCHOOL);
  const cls = await settledLayoutShift(visitor);
  testInfo.annotations.push({ type: 'CLS', description: cls.toFixed(4) });
  expect(cls, 'cumulative layout shift on the landing page').toBeLessThanOrEqual(0.01);
  await checkPage(visitor);

  // The French name is an isolated LTR run inside RTL Arabic, in the header and the hero.
  const brand = visitor.getByTestId('brand').locator('bdi[lang="fr"]');
  await expect(brand).toHaveText(SCHOOL);
  await expect(brand).toHaveAttribute('dir', 'ltr');
  expect(await brand.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
  expect(await brand.evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe('isolate');

  // Reading order in «مدرسة Collège de la Salle»: the Arabic word comes first, i.e. to the right
  // (or on the line above when the heading wraps).
  const order = await visitor.locator('#hero-title').evaluate((h1) => {
    const text = Array.from(h1.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.includes('مدرسة'));
    const bdi = h1.querySelector('bdi');
    if (!text || !bdi) return null;
    const range = document.createRange();
    range.selectNodeContents(text);
    const a = range.getBoundingClientRect();
    const b = bdi.getBoundingClientRect();
    return { arabicLeft: a.left, arabicTop: a.top, latinRight: b.right, latinTop: b.top };
  });
  expect(order).not.toBeNull();
  if (order) {
    const sameLine = Math.abs(order.arabicTop - order.latinTop) < 4;
    expect(sameLine ? order.arabicLeft >= order.latinRight - 1 : order.arabicTop < order.latinTop).toBe(true);
  }

  /* -------------------------------------------- Navigate through the dropdown */
  const sections = visitor.getByRole('button', { name: 'الأقسام' });
  await expect(sections).toHaveAttribute('aria-expanded', 'false');
  await sections.click();
  await expect(sections).toHaveAttribute('aria-expanded', 'true');
  await checkPage(visitor);
  await visitor.keyboard.press('Escape');
  await expect(sections).toHaveAttribute('aria-expanded', 'false');
  await expect(sections).toBeFocused();
  await sections.click();
  await visitor.getByRole('navigation', { name: 'التنقّل الرئيس' }).getByRole('link', { name: 'القسم العربي' }).click();

  await expect(visitor).toHaveURL(/\/sections\/arabic$/);
  await expect(visitor.getByRole('heading', { level: 1 })).toContainText('القسم العربي');
  await expect(visitor.getByRole('heading', { name: 'تاريخ اللغة العربية في مصر' })).toBeVisible();
  await expect(visitor.getByTestId('tracks')).toContainText('علمي رياضة');
  await checkPage(visitor);

  /* -------------------------------------------- Start the timed practice exam (no account) */
  const practice = visitor.getByTestId('practice-exams').getByRole('link', { name: new RegExp(title) });
  await expect(practice).toBeVisible();
  await practice.click();
  await expect(visitor).toHaveURL(/\/take\/[A-HJKMNP-Z2-9]{6}$/);
  await expect(visitor.getByRole('heading', { name: title })).toBeVisible();
  await visitor.getByLabel('اسمك الكامل').fill('ليلى');
  await visitor.getByRole('button', { name: 'ابدأ الاختبار' }).click();
  await expect(visitor.getByTestId('clock')).toHaveText(ARABIC_CLOCK);
  await expect(visitor.locator('exam-question-card .prompt')).toHaveText('ما إعراب «الطالبُ» في: الطالبُ مجتهدٌ؟');
  await checkPage(visitor);

  await examiner.context().close();
  await visitor.context().close();
});

test('every public page is prerendered, shift-free, and isolates Latin formulas', async ({ browser }, testInfo) => {
  const page = await newPage(browser);
  await trackLayoutShift(page);

  // Prerendered: the HTML response already contains the page content, before any JavaScript runs.
  for (const [path, text] of [
    ['/', 'المواد الدراسية'],
    ['/about/history', 'النشأة والرسالة'],
    ['/about/news', 'الأخبار'],
    ['/about/gallery', 'معرض الصور'],
    ['/sections/arabic', 'تاريخ اللغة العربية في مصر'],
    ['/subjects/chemistry', 'الكيمياء'],
  ] as const) {
    const html = await (await page.request.get(path)).text();
    expect(html, `${path} should be prerendered`).toContain(text);
    expect(html).toContain('lang="fr"');
  }

  for (const path of ['/about/history', '/about/news', '/about/gallery', '/subjects/physics']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await checkPage(page);
  }
  const cls = await settledLayoutShift(page);
  testInfo.annotations.push({ type: 'CLS', description: cls.toFixed(4) });
  expect(cls).toBeLessThanOrEqual(0.01);

  // Placeholder content is labelled as such.
  await page.goto('/about/news');
  await expect(page.getByText('خبر تجريبي').first()).toBeVisible();

  // A Latin formula inside an Arabic sentence keeps its own LTR order.
  await page.goto('/subjects/physics');
  const formula = page.getByTestId('notation');
  await expect(formula).toHaveText('V = I R');
  expect(await formula.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');

  // Unknown subjects get an Arabic not-found message, not a crash.
  await page.goto('/subjects/biology');
  await expect(page.getByRole('heading', { name: 'المادة غير موجودة' })).toBeVisible();

  await page.context().close();
});
