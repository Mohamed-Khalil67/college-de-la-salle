import { expect, type Page, test } from '@playwright/test';
import { checkPage, newPage, resetContent, signInAs } from './helpers';

/*
 * The Collège de la Salle portal, end to end:
 *  1. Arabic RTL → French LTR without layout or font distortion (and no layout shift);
 *  2. Teacher Mode: activate, edit a chapter title on the Mathématiques page, see it persist;
 *  3. A student takes a timed exam from a subject page and is auto-submitted when the timer ends.
 */

test.beforeEach(async () => {
  // Teacher edits are shared state in the emulator: every test starts from the bundled content.
  await resetContent();
});

const ARABIC_CLOCK = /^⁦[٠-٩]{2}:[٠-٩]{2}⁩$/;

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

async function layoutShift(page: Page): Promise<number> {
  await page.waitForLoadState('load');
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return (window as unknown as { __cls: number }).__cls;
  });
}

/** Clicks a primary-navigation link, opening the mobile menu first when it is collapsed. */
async function goTo(page: Page, name: string | RegExp): Promise<void> {
  const menu = page.getByRole('button', { name: /^(القائمة|Menu)$/ });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: /^(التنقّل الرئيس|Navigation principale)$/ })
    .getByRole('link', { name })
    .click();
}

const lang = (page: Page) => page.locator('html').getAttribute('lang');
const dir = (page: Page) => page.locator('html').getAttribute('dir');

test('Arabic RTL ↔ French LTR: direction, fonts and layout flip cleanly, with no layout shift', async ({ browser }, testInfo) => {
  const page = await newPage(browser);
  await trackLayoutShift(page);

  /* -------------------------------------------- Accueil (Arabic, RTL) */
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('الثانوية العامة');
  expect([await lang(page), await dir(page)]).toEqual(['ar', 'rtl']);
  await checkPage(page);

  // The French school name is an isolated LTR run, even inside the Arabic header.
  const brand = page.getByTestId('brand').locator('bdi[lang="fr"]');
  await expect(brand).toHaveText('Collège de la Salle');
  expect(await brand.evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe('isolate');
  const arabicBrandSide = (await page.getByTestId('brand').boundingBox())!.x;
  const viewport = page.viewportSize()!.width;
  expect(arabicBrandSide, 'brand sits on the right in RTL').toBeGreaterThan(viewport / 3);

  // One flat navigation: no dropdowns, and every destination from the brief.
  const nav = page.getByRole('navigation', { name: 'التنقّل الرئيس' });
  const menu = page.getByRole('button', { name: /^(القائمة|Menu)$/ });
  if (await menu.isVisible()) await menu.click();
  for (const name of ['الرئيسية', 'عن المدرسة وتاريخها', 'اللغة العربية', 'Mathématiques', 'Physique-Chimie', 'بنك الامتحانات', 'Mode Enseignant']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.locator('app-nav-menu, [aria-haspopup]')).toHaveCount(0);
  if (await menu.isVisible()) await menu.click();

  /* -------------------------------------------- اللغة العربية (Arabic) */
  await goTo(page, 'اللغة العربية');
  await expect(page).toHaveURL(/\/ar\/matiere\/arabe$/);
  await expect(page.getByTestId('subject-title')).toHaveText('اللغة العربية');
  await expect(page.getByRole('heading', { name: 'العربية في مصر' })).toBeVisible();
  expect([await lang(page), await dir(page)]).toEqual(['ar', 'rtl']);
  await checkPage(page);

  /* -------------------------------------------- Mathématiques (French, LTR) */
  await goTo(page, 'Mathématiques');
  await expect(page).toHaveURL(/\/fr\/matiere\/mathematiques$/);
  await expect(page.getByTestId('subject-title')).toHaveText('Mathématiques');
  expect([await lang(page), await dir(page)]).toEqual(['fr', 'ltr']);
  await checkPage(page); // Inter, LTR, no overflow
  await expect(page.getByRole('heading', { name: 'Programme' })).toBeVisible();
  await expect(page.getByTestId('chapter-title').first()).toHaveText('Analyse');
  await expect(page).toHaveTitle('Mathématiques — Collège de la Salle');
  // The math formula keeps its own order inside the French text.
  await expect(page.getByText('∫ x dx = x²/2 + C')).toBeVisible();
  // Direction flipped: the brand now sits on the left.
  expect((await page.getByTestId('brand').boundingBox())!.x).toBeLessThan(viewport / 3);

  /* -------------------------------------------- Physique-Chimie (French, LTR) */
  await goTo(page, 'Physique-Chimie');
  await expect(page).toHaveURL(/\/fr\/matiere\/physique-chimie$/);
  await expect(page.getByTestId('subject-title')).toHaveText('Physique-Chimie');
  expect([await lang(page), await dir(page)]).toEqual(['fr', 'ltr']);
  await expect(page.getByText("Loi d'Ohm : V = I R")).toBeVisible();
  await checkPage(page);

  /* -------------------------------------------- Back to Arabic: nothing stuck in LTR */
  await goTo(page, 'عن المدرسة وتاريخها');
  await expect(page).toHaveURL(/\/ar\/histoire$/);
  expect([await lang(page), await dir(page)]).toEqual(['ar', 'rtl']);
  await checkPage(page);

  const cls = await layoutShift(page);
  testInfo.annotations.push({ type: 'CLS', description: cls.toFixed(4) });
  expect(cls, 'cumulative layout shift across the tour').toBeLessThanOrEqual(0.01);
  await page.context().close();
});

test('every public page is prerendered with its own language, and the heritage archive is interactive', async ({ browser }, testInfo) => {
  const page = await newPage(browser);
  await trackLayoutShift(page);

  // Prerendered: the HTML response already holds the content and the right <html lang dir>.
  for (const [path, text, language, direction] of [
    ['/', 'تراث المدرسة', 'ar', 'rtl'],
    ['/ar/histoire', 'تأسيس المدرسة في الظاهر', 'ar', 'rtl'],
    ['/ar/matiere/arabe', 'تاريخ العربية', 'ar', 'rtl'],
    ['/fr/matiere/mathematiques', 'Dérivées et applications', 'fr', 'ltr'],
    ['/fr/matiere/physique-chimie', 'Équilibre chimique', 'fr', 'ltr'],
  ] as const) {
    const html = await (await page.request.get(path)).text();
    expect(html, `${path} should be prerendered`).toContain(text);
    expect(html, `${path} language`).toMatch(new RegExp(`<html[^>]*lang="${language}"`));
    expect(html, `${path} direction`).toMatch(new RegExp(`<html[^>]*dir="${direction}"`));
    expect(html).toContain('name="description"');
  }

  // School history: the four milestones from the administration, chronological and interactive.
  await page.goto('/ar/histoire');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText(['١٨٩٨', '١٩٠٥', '١٩٥٤–١٩٥٨', '١٩٥٧']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('تأسيس المدرسة في الظاهر');
  await tabs.nth(1).click();
  await expect(page.getByRole('tabpanel')).toContainText('الطوب الأحمر');
  await expect(page.getByRole('tabpanel').getByRole('img')).toHaveAttribute('src', /campus\.svg/);

  // Keyboard: in RTL the "next" arrow points left.
  await tabs.nth(1).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('ديسمبر ١٩٥٨');
  await page.keyboard.press('End');
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('خورنفش');
  await checkPage(page);

  // The picture sits in a reserved 3:2 box, so swapping milestones moves nothing.
  const box = await page.getByRole('tabpanel').locator('.aspect-3\\/2').boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(1.5, 1);

  const cls = await layoutShift(page);
  testInfo.annotations.push({ type: 'CLS', description: cls.toFixed(4) });
  expect(cls).toBeLessThanOrEqual(0.01);
  await page.context().close();
});

test('Teacher Mode: sign in from the navbar, edit a Mathématiques chapter, and it persists', async ({ browser }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const newTitle = `Analyse et fonctions (${stamp})`;
  const teacher = await newPage(browser);
  const visitor = await newPage(browser);

  // Not signed in: no editing controls anywhere.
  await teacher.goto('/fr/matiere/mathematiques');
  await expect(teacher.getByTestId('chapter-title').first()).toHaveText('Analyse');
  await expect(teacher.getByTestId('teacher-bar')).toHaveCount(0);
  await expect(teacher.getByTestId('edit-chapters')).toHaveCount(0);

  // «Mode Enseignant» in the navbar leads to sign-in, and back to the same page.
  if (await teacher.getByRole('button', { name: /^(القائمة|Menu)$/ }).isVisible()) {
    await teacher.getByRole('button', { name: /^(القائمة|Menu)$/ }).click();
  }
  await teacher.getByTestId('teacher-login').click();
  await expect(teacher).toHaveURL(/\/sign-in/);
  await signInAs(teacher, `prof-${stamp}@example.test`.toLowerCase(), 'Prof Test');
  await expect(teacher).toHaveURL(/\/fr\/matiere\/mathematiques$/);

  // The floating switch appears; editing is off until it's switched on.
  const bar = teacher.getByTestId('teacher-bar');
  await expect(bar).toBeVisible();
  const toggle = bar.getByRole('switch', { name: 'Mode Enseignant' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(teacher.getByTestId('edit-chapters')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await checkPage(teacher);

  // Validation, in French (the page's language).
  await teacher.getByTestId('edit-chapters').click();
  const titleField = teacher.getByLabel('Titre du chapitre').first();
  await expect(titleField).toHaveValue('Analyse');
  await titleField.fill('');
  await teacher.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(teacher.getByText('Ce champ est obligatoire.')).toBeVisible();

  // Save: the page updates at once (optimistic), then the write is confirmed.
  await titleField.fill(newTitle);
  await teacher.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(teacher.getByTestId('chapter-title').first()).toHaveText(newTitle);
  await expect(teacher.getByTestId('save-status')).toContainText('Enregistré');
  await expect(teacher.getByText('Plan indicatif')).toHaveCount(0); // no longer the bundled default
  await checkPage(teacher);

  // Persistence: survives a reload (served from Firestore after hydration)…
  await teacher.reload();
  await expect(teacher.getByTestId('chapter-title').first()).toHaveText(newTitle);
  // …and it is public: an anonymous visitor sees the teacher's change.
  await visitor.goto('/fr/matiere/mathematiques');
  await expect(visitor.getByTestId('chapter-title').first()).toHaveText(newTitle);
  await expect(visitor.getByTestId('edit-chapters')).toHaveCount(0);

  // Switching Teacher Mode off hides the editing controls again.
  await teacher.getByTestId('teacher-bar').getByRole('switch').click();
  await expect(teacher.getByTestId('edit-chapters')).toHaveCount(0);

  await teacher.context().close();
  await visitor.context().close();
});

test('a student starts a timed exam from a subject page and is auto-submitted when the timer ends', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Waits for a real one-minute timer; one project is enough.');
  test.setTimeout(240_000);
  const title = `مراجعة البلاغة — ${Date.now()}`;

  /* -------------------------------------------- A teacher lists a one-minute exam on the Arabic page */
  const teacher = await newPage(browser);
  await teacher.goto('/sign-in');
  await signInAs(teacher, `prof-exam-${Date.now()}@example.test`, 'Prof Exam');
  await expect(teacher).toHaveURL(/\/examiner$/);
  await teacher.getByRole('link', { name: 'اختبار جديد' }).click();
  await teacher.getByLabel('المدة (بالدقائق)').fill('1');
  await teacher.getByLabel('عنوان الاختبار').fill(title);
  await teacher.getByLabel('نصّ السؤال', { exact: true }).first().fill('ما نوع الصورة البيانية في «الدنيا مسرح»؟');
  await teacher.getByLabel('نصّ الخيار 1', { exact: true }).fill('تشبيه بليغ');
  await teacher.getByLabel('نصّ الخيار 2', { exact: true }).fill('كناية');
  await teacher.getByLabel('تحديد الخيار 1 إجابةً صحيحة').check();
  await teacher.getByLabel('المادة الدراسية').selectOption('arabic');
  await teacher.getByLabel(/عرضه في صفحة المادة/).check();
  await teacher.getByRole('button', { name: 'نشر الاختبار' }).click();
  await expect(teacher.getByRole('heading', { name: 'شارِك الاختبار مع المُختبَرين' })).toBeVisible();

  /* -------------------------------------------- A student, no account, from the subject page */
  const student = await newPage(browser);
  await student.goto('/ar/matiere/arabe');
  const card = student.getByTestId('practice-exams').getByRole('link', { name: new RegExp(title) });
  await expect(card).toBeVisible();
  await card.click();
  await expect(student).toHaveURL(/\/take\/[A-HJKMNP-Z2-9]{6}$/);
  await student.getByLabel('اسمك الكامل').fill('ليلى');
  await student.getByRole('button', { name: 'ابدأ الاختبار' }).click();
  await expect(student.getByTestId('clock')).toHaveText(ARABIC_CLOCK);
  await student.getByRole('radio', { name: 'تشبيه بليغ' }).check();
  await expect(student.getByTestId('save-state')).toContainText('حُفِظت إجاباتك على الخادم');
  await checkPage(student);

  // No submit click: the timer runs out and the runner submits by itself.
  await expect(student.getByRole('heading', { name: 'تسلَّمنا إجاباتك' })).toBeVisible({ timeout: 90_000 });

  // The teacher sees the (client-submitted) answer on the dashboard.
  await teacher.getByRole('link', { name: 'متابعة النتائج مباشرةً' }).click();
  const row = teacher.getByTestId('candidates').locator('tbody tr').first();
  await expect(row.getByTestId('candidate-name')).toHaveText('ليلى');
  await expect(row.getByTestId('score')).toHaveText('١ من ١');

  await teacher.context().close();
  await student.context().close();
});
