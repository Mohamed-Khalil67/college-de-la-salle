import { type Browser, expect, type Page, test } from '@playwright/test';

/*
 * Full Arabic vertical slice, with two isolated browser contexts (examiner + candidate, so each
 * has its own Firebase identity):
 *
 *   examiner creates an exam → shares the direct link → candidate completes it in RTL
 *   → the submission shows up in the examiner's history, with names and mixed-script text intact.
 *
 * Every page is also checked for layout and script integrity (see `assertRtlIntegrity`).
 */

const MIXED_TITLE = 'اختبار الدوال f(x) — الوحدة الثالثة';
const MIXED_PROMPT = 'إذا كانت f(x) = 2x + 3، فما قيمة f(4)؟';
const ESSAY_PROMPT = 'اشرح المقصود بـ «المُتغيِّر المستقل» في الدالة y = f(x).';
const CANDIDATE_NAME = 'سارة Smith';
const ESSAY_ANSWER = 'المُتغيِّرُ المستقلُّ هو x؛ إذ تُحدِّد قيمتُه قيمةَ y عبر القاعدة f.';

const ARABIC_CLOCK = /^⁦[٠-٩]{2}:[٠-٩]{2}⁩$/;

test('examiner creates, candidate completes in RTL, examiner sees the graded entry', async ({
  browser,
}, testInfo) => {
  const examiner = await newPage(browser);
  const candidate = await newPage(browser);
  const examinerEmail = `e2e-${testInfo.project.name}-${Date.now()}@example.test`;

  /* ---------------------------------------------------------------- 1. Examiner signs in */
  await examiner.goto('/sign-in');
  await assertRtlIntegrity(examiner);
  await examiner.getByLabel('بريد المُمتحِن').fill(examinerEmail);
  await examiner.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(examiner).toHaveURL(/\/examiner$/);
  await expect(examiner.getByRole('heading', { name: 'الاختبارات والنتائج المباشرة' })).toBeVisible();

  /* ---------------------------------------------------------------- 2. Creates the exam */
  await examiner.getByRole('link', { name: 'اختبار جديد' }).click();
  await expect(examiner.getByRole('heading', { name: 'إعداد اختبار' })).toBeVisible();
  await assertRtlIntegrity(examiner);

  // Validation messages are in Arabic.
  await examiner.getByRole('button', { name: 'نشر الاختبار' }).click();
  await expect(examiner.getByText('أدخِل عنوانًا للاختبار.')).toBeVisible();

  await examiner.getByLabel('عنوان الاختبار').fill(MIXED_TITLE);
  await examiner.getByLabel('نصّ السؤال', { exact: true }).first().fill(MIXED_PROMPT);
  await examiner.getByLabel('نصّ الخيار 1', { exact: true }).fill('11');
  await examiner.getByLabel('نصّ الخيار 2', { exact: true }).fill('9');
  await examiner.getByLabel('تحديد الخيار 1 إجابةً صحيحة').check();

  await examiner.getByRole('button', { name: '+ سؤال مقالي' }).click();
  await examiner.getByLabel('نصّ السؤال', { exact: true }).nth(1).fill(ESSAY_PROMPT);
  await examiner.getByLabel('معايير التصحيح').fill('٣ درجات: تحديد x. درجتان: شرح العلاقة بـ y.');

  await examiner.getByRole('button', { name: 'نشر الاختبار' }).click();
  await expect(examiner.getByRole('heading', { name: 'شارِك الاختبار مع المُختبَرين' })).toBeVisible();
  const shareUrl = (await examiner.getByTestId('share-url').textContent())!.trim();
  expect(shareUrl).toMatch(/\/take\/[A-HJKMNP-Z2-9]{6}$/);

  /* ---------------------------------------------------------------- 3. Candidate opens the link */
  await candidate.goto(shareUrl);
  await expect(candidate.getByRole('heading', { name: MIXED_TITLE })).toBeVisible();
  await assertRtlIntegrity(candidate);
  await expect(candidate.getByText('سؤالان')).toBeVisible(); // Arabic dual, not "2 أسئلة"

  await candidate.getByLabel('اسمك الكامل').fill(CANDIDATE_NAME);
  await candidate.getByRole('button', { name: 'ابدأ الاختبار' }).click();

  /* ---------------------------------------------------------------- 4. Takes the exam in RTL */
  const clock = candidate.getByTestId('clock');
  await expect(clock).toHaveText(ARABIC_CLOCK);
  await assertRtlIntegrity(candidate);

  // Mixed-script prompt round-trips byte-for-byte and is bidi-isolated.
  const prompt = candidate.locator('exam-question-card .prompt');
  await expect(prompt).toHaveText(MIXED_PROMPT);
  await expect(prompt).toHaveAttribute('dir', 'auto');
  expect(await prompt.evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe('plaintext');

  // Question cards lay out from the right: the legend sits at the card's inline-start (right).
  const card = await candidate.locator('exam-question-card fieldset').boundingBox();
  const legend = await candidate.locator('exam-question-card legend').boundingBox();
  expect(card && legend).toBeTruthy();
  expect(card!.x + card!.width - (legend!.x + legend!.width)).toBeLessThan(card!.width / 3);

  await candidate.getByRole('radio', { name: '11' }).check();
  await candidate.locator('exam-text-question-card textarea').fill(ESSAY_ANSWER);
  await expect(candidate.getByTestId('progress')).toContainText('الأسئلة المُجاب عنها: ٢ من ٢');
  await candidate.screenshot({ path: testInfo.outputPath('runner-rtl.png') });

  await candidate.getByRole('button', { name: 'تسليم الإجابات' }).click();
  await candidate.getByRole('button', { name: 'نعم، سلِّم الآن' }).click();
  await expect(candidate.getByRole('heading', { name: 'تسلَّمنا إجاباتك' })).toBeVisible();

  /* ---------------------------------------------------------------- 5. Examiner's history */
  await examiner.getByRole('link', { name: 'متابعة النتائج مباشرةً' }).click();
  const row = examiner.getByTestId('candidates').locator('tbody tr').first();
  await expect(row.getByTestId('candidate-name')).toHaveText(CANDIDATE_NAME);
  await expect(row.getByText('بانتظار التصحيح')).toBeVisible();
  await expect(row.getByTestId('score')).toContainText('١ + ؟ من ٦');
  await assertRtlIntegrity(examiner);

  // Table columns run right-to-left: the first header (المُختبَر) is the rightmost.
  const headers = examiner.getByTestId('candidates').locator('thead th');
  const first = (await headers.first().boundingBox())!;
  const second = (await headers.nth(1).boundingBox())!;
  expect(first.x).toBeGreaterThan(second.x);

  // Grade the written answer and see the final score resolve live.
  await row.getByRole('button', { name: /صحِّح/ }).click();
  await expect(examiner.locator('exam-text-answer-grader .answer')).toHaveText(ESSAY_ANSWER);
  await examiner.getByLabel(/الدرجة \(من ٠ إلى ٥\)/).fill('4');
  await examiner.getByRole('button', { name: 'حفظ الدرجة' }).click();
  await expect(row.getByTestId('score')).toHaveText('٥ من ٦');
  await expect(row.getByText('صُحِّح')).toBeVisible();
  await examiner.screenshot({ path: testInfo.outputPath('history-rtl.png'), fullPage: true });

  await examiner.context().close();
  await candidate.context().close();
});

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: 'ar', colorScheme: 'light' });
  return context.newPage();
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
