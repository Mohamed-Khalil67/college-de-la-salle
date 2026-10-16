import { type Browser, expect, type Page, test } from '@playwright/test';

/*
 * Arabic end-to-end suite, with isolated browser contexts per actor (each has its own Firebase
 * identity). Every page visited is checked for:
 *   - RTL layout and script integrity (`assertRtlIntegrity`), and
 *   - untranslated interface text (`assertNoUntranslatedText`): any Latin word in UI copy,
 *     placeholders, aria-labels or titles fails the test, except user-authored content (which the
 *     app isolates with examIsolate / <bdi> / <code> / .ltr) and the brand name "Google".
 */

const MIXED_TITLE = 'اختبار الدوال f(x) — الوحدة الثالثة';
const MIXED_PROMPT = 'إذا كانت f(x) = 2x + 3، فما قيمة f(4)؟';
const ESSAY_PROMPT = 'اشرح المقصود بـ «المُتغيِّر المستقل» في الدالة y = f(x).';
const CANDIDATE_NAME = 'سارة Smith';
const ESSAY_ANSWER = 'المُتغيِّرُ المستقلُّ هو x؛ إذ تُحدِّد قيمتُه قيمةَ y عبر القاعدة f.';

const ARABIC_CLOCK = /^⁦[٠-٩]{2}:[٠-٩]{2}⁩$/;

test('examiner creates, candidate completes in RTL with flags and autosave, result is released', async ({
  browser,
}, testInfo) => {
  const examiner = await newPage(browser);
  const candidate = await newPage(browser);

  /* ---------------------------------------------------------------- 0. Public pages */
  await candidate.goto('/');
  await checkPage(candidate);
  await candidate.goto('/take/ZZZZZZ');
  await expect(candidate.getByRole('heading', { name: 'تعذَّر فتح الاختبار' })).toBeVisible();
  await checkPage(candidate);

  /* ---------------------------------------------------------------- 1. Examiner signs in */
  await signInExaminer(examiner, testInfo.project.name);
  await checkPage(examiner);

  /* ---------------------------------------------------------------- 2. Creates the exam */
  await examiner.getByRole('link', { name: 'اختبار جديد' }).click();
  await expect(examiner.getByRole('heading', { name: 'إعداد اختبار' })).toBeVisible();
  await checkPage(examiner);

  // Examiner-defined time and scoring render in Arabic digits, dates in Arabic words.
  await expect(examiner.getByLabel('المدة (بالدقائق)')).toHaveValue('٥');
  await examiner.getByLabel('المدة (بالدقائق)').fill('10'); // Latin keyboard input…
  await expect(examiner.getByLabel('المدة (بالدقائق)')).toHaveValue('١٠'); // …shown as ١٠
  await expect(examiner.locator('exam-datetime-input .preview').first()).toContainText('٢٠');
  await expect(examiner.getByLabel('درجة النجاح (نسبة مئوية)')).toHaveValue('٥٠');
  await examiner.getByLabel('درجة النجاح (نسبة مئوية)').fill('60');

  // Validation messages are in Arabic.
  await examiner.getByRole('button', { name: 'نشر الاختبار' }).click();
  await expect(examiner.getByText('أدخِل عنوانًا للاختبار.')).toBeVisible();
  await checkPage(examiner);

  await examiner.getByLabel('عنوان الاختبار').fill(MIXED_TITLE);
  await examiner.getByLabel('نصّ السؤال', { exact: true }).first().fill(MIXED_PROMPT);
  await examiner.getByLabel('نصّ الخيار 1', { exact: true }).fill('11');
  await examiner.getByLabel('نصّ الخيار 2', { exact: true }).fill('9');
  await examiner.getByLabel('تحديد الخيار 1 إجابةً صحيحة').check();

  await examiner.getByRole('button', { name: '+ سؤال مقالي' }).click();
  await examiner.getByLabel('نصّ السؤال', { exact: true }).nth(1).fill(ESSAY_PROMPT);
  await examiner.getByLabel('معايير التصحيح').fill('٣ درجات: تحديد x. درجتان: شرح العلاقة بـ y.');
  await checkPage(examiner);

  await examiner.getByRole('button', { name: 'نشر الاختبار' }).click();
  await expect(examiner.getByRole('heading', { name: 'شارِك الاختبار مع المُختبَرين' })).toBeVisible();
  await checkPage(examiner);
  const shareUrl = (await examiner.getByTestId('share-url').textContent())!.trim();
  expect(shareUrl).toMatch(/\/take\/[A-HJKMNP-Z2-9]{6}$/);

  /* ---------------------------------------------------------------- 3. Candidate opens the link */
  await candidate.goto(shareUrl);
  await expect(candidate.getByRole('heading', { name: MIXED_TITLE })).toBeVisible();
  await checkPage(candidate);
  await expect(candidate.getByText('سؤالان')).toBeVisible(); // Arabic dual, not "2 أسئلة"

  await candidate.getByLabel('اسمك الكامل').fill(CANDIDATE_NAME);
  await candidate.getByRole('button', { name: 'ابدأ الاختبار' }).click();

  /* ---------------------------------------------------------------- 4. Takes the exam in RTL */
  await expect(candidate.getByTestId('clock')).toHaveText(ARABIC_CLOCK);
  await checkPage(candidate);

  // Mixed-script prompt round-trips byte-for-byte and is bidi-isolated.
  const prompt = candidate.locator('exam-question-card .prompt');
  await expect(prompt).toHaveText(MIXED_PROMPT);
  await expect(prompt).toHaveAttribute('dir', 'auto');
  expect(await prompt.evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe('plaintext');

  // Question navigator: one box per question, both unanswered.
  const nav = candidate.getByRole('navigation', { name: 'خريطة الأسئلة' });
  await expect(nav.getByRole('button', { name: 'السؤال ١: لم يُجَب عنه' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'السؤال ٢: لم يُجَب عنه' })).toBeVisible();

  // Answer Q1, flag it for review; the navigator and autosave follow.
  await candidate.getByRole('radio', { name: '11' }).check();
  await candidate.getByRole('button', { name: 'علِّم للمراجعة' }).first().click();
  await expect(nav.getByRole('button', { name: 'السؤال ١: مُجاب عنه، مُعلَّم للمراجعة' })).toBeVisible();
  await expect(candidate.getByTestId('save-state')).toContainText('حُفِظت إجاباتك على الخادم');

  // The submit confirmation lists what is unanswered and what is flagged, with jump links.
  await candidate.getByRole('button', { name: 'تسليم الإجابات' }).click();
  await expect(candidate.getByTestId('unanswered')).toContainText('السؤال ٢');
  await expect(candidate.getByTestId('flagged')).toContainText('السؤال ١');
  await checkPage(candidate);
  await candidate.getByTestId('unanswered').getByRole('button', { name: 'السؤال ٢' }).click();
  await expect(candidate.locator('exam-text-question-card textarea')).toBeFocused();
  await candidate.getByRole('button', { name: 'متابعة الحلّ' }).click();

  await candidate.locator('exam-text-question-card textarea').fill(ESSAY_ANSWER);
  await expect(candidate.getByTestId('progress')).toContainText('الأسئلة المُجاب عنها: ٢ من ٢');
  await expect(candidate.getByTestId('save-state')).toContainText('حُفِظت إجاباتك على الخادم');
  await candidate.screenshot({ path: testInfo.outputPath('runner-rtl.png') });

  await candidate.getByRole('button', { name: 'تسليم الإجابات' }).click();
  await expect(candidate.getByText('أجبتَ عن جميع الأسئلة.')).toBeVisible();
  await candidate.getByRole('button', { name: 'نعم، سلِّم الآن' }).click();
  await expect(candidate.getByRole('heading', { name: 'تسلَّمنا إجاباتك' })).toBeVisible();
  // Written answer still ungraded: the score is withheld.
  await expect(candidate.getByTestId('result-pending')).toBeVisible();
  await checkPage(candidate);

  /* ---------------------------------------------------------------- 5. Examiner's history */
  await examiner.getByRole('link', { name: 'متابعة النتائج مباشرةً' }).click();
  const row = examiner.getByTestId('candidates').locator('tbody tr').first();
  await expect(row.getByTestId('candidate-name')).toHaveText(CANDIDATE_NAME);
  await expect(row.getByText('بانتظار التصحيح')).toBeVisible();
  await expect(row.getByTestId('score')).toContainText('١ + ؟ من ٦');
  await checkPage(examiner);

  // Table columns run right-to-left: the first header (المُختبَر) is the rightmost.
  const headers = examiner.getByTestId('candidates').locator('thead th');
  const first = (await headers.first().boundingBox())!;
  const second = (await headers.nth(1).boundingBox())!;
  expect(first.x).toBeGreaterThan(second.x);

  // Grade the written answer; the final score, verdict and pass rate resolve live.
  await row.getByRole('button', { name: /صحِّح/ }).click();
  await expect(examiner.locator('exam-text-answer-grader .answer')).toHaveText(ESSAY_ANSWER);
  await checkPage(examiner);
  await examiner.getByLabel(/الدرجة \(من ٠ إلى ٥\)/).fill('4');
  await examiner.getByRole('button', { name: 'حفظ الدرجة' }).click();
  await expect(row.getByTestId('score')).toHaveText('٥ من ٦');
  await expect(row.getByTestId('verdict')).toHaveText('ناجح');
  // ICU appends an Arabic Letter Mark (U+061C) after ٪ to keep it attached in RTL.
  await expect(examiner.getByTestId('pass-rate')).toHaveText(/^١٠٠٪\u061C?$/);
  await checkPage(examiner);
  await examiner.screenshot({ path: testInfo.outputPath('history-rtl.png'), fullPage: true });

  /* ---------------------------------------------------------------- 6. Candidate sees the result */
  // ON_GRADED release: the result appears on the candidate's open page without a reload.
  await expect(candidate.getByTestId('result-score')).toHaveText('٥ من ٦');
  await expect(candidate.getByText('ناجح، مبارك!')).toBeVisible();
  await expect(candidate.getByTestId('result')).toContainText('٨٣٫٣٪');
  await checkPage(candidate);
  await candidate.screenshot({ path: testInfo.outputPath('result-rtl.png'), fullPage: true });

  await examiner.context().close();
  await candidate.context().close();
});

test('device dies mid-exam: the server submits the autosaved draft; results wait for publishing', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Timing-based; one project is enough.');
  test.setTimeout(240_000);

  const examiner = await newPage(browser);
  const candidateContext = await browser.newContext({ locale: 'ar', colorScheme: 'light' });
  let candidate = await candidateContext.newPage();

  await signInExaminer(examiner, 'draft');
  await examiner.getByRole('link', { name: 'اختبار جديد' }).click();
  await examiner.getByLabel('المدة (بالدقائق)').fill('1');
  await examiner.getByLabel('إظهار النتيجة للمُختبَر').selectOption('MANUAL');
  await examiner.getByLabel('عنوان الاختبار').fill('اختبار قصير للحفظ التلقائي');
  await examiner.getByLabel('نصّ السؤال', { exact: true }).first().fill('٢ + ٢ = ؟');
  await examiner.getByLabel('نصّ الخيار 1', { exact: true }).fill('٤');
  await examiner.getByLabel('نصّ الخيار 2', { exact: true }).fill('٥');
  await examiner.getByRole('button', { name: 'نشر الاختبار' }).click();
  const shareUrl = (await examiner.getByTestId('share-url').textContent())!.trim();

  // Candidate answers; the autosave reaches the server.
  await candidate.goto(shareUrl);
  await candidate.getByLabel('اسمك الكامل').fill('خالد');
  await candidate.getByRole('button', { name: 'ابدأ الاختبار' }).click();
  await candidate.getByRole('radio', { name: '٤' }).check();
  await expect(candidate.getByTestId('save-state')).toContainText('حُفِظت إجاباتك على الخادم');

  // The device dies: the page is gone before the timer could auto-submit.
  await candidate.close();
  await new Promise((resolve) => setTimeout(resolve, 65_000));

  // Reconnecting after the deadline: the server has submitted the draft on the candidate's behalf.
  candidate = await candidateContext.newPage();
  await candidate.goto(shareUrl);
  await candidate.getByLabel('اسمك الكامل').fill('خالد');
  await candidate.getByRole('button', { name: 'ابدأ الاختبار' }).click();
  await expect(candidate.getByRole('heading', { name: 'تسلَّمنا إجاباتك' })).toBeVisible();
  // MANUAL release: graded, but hidden until the examiner publishes.
  await expect(candidate.getByTestId('result-pending')).toBeVisible();
  await checkPage(candidate);

  await examiner.getByRole('link', { name: 'متابعة النتائج مباشرةً' }).click();
  const row = examiner.getByTestId('candidates').locator('tbody tr').first();
  await expect(row.getByText('حفظ الخادم عند انتهاء الوقت')).toBeVisible();
  await expect(row.getByTestId('score')).toHaveText('١ من ١');
  await expect(examiner.getByTestId('release')).toContainText('مخفية حتى تنشرها');
  await checkPage(examiner);

  await examiner.getByRole('button', { name: 'نشر النتائج للمُختبَرين' }).click();
  await expect(examiner.getByTestId('release')).toContainText('منشورة للمُختبَرين');
  await expect(examiner.getByText('نُشِرت النتائج: نتيجة واحدة.')).toBeVisible();

  // The candidate's open page updates live.
  await expect(candidate.getByTestId('result-score')).toHaveText('١ من ١');
  await checkPage(candidate);

  await examiner.context().close();
  await candidateContext.close();
});

/* ---------------------------------------------------------------------------------------------- */

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: 'ar', colorScheme: 'light' });
  return context.newPage();
}

async function signInExaminer(page: Page, tag: string): Promise<void> {
  await page.goto('/sign-in');
  await checkPage(page);
  await page.getByLabel('بريد المُمتحِن').fill(`e2e-${tag}-${Date.now()}@example.test`);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page).toHaveURL(/\/examiner$/);
  await expect(page.getByRole('heading', { name: 'الاختبارات والنتائج المباشرة' })).toBeVisible();
}

async function checkPage(page: Page): Promise<void> {
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
