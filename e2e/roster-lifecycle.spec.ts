import { expect, test } from '@playwright/test';
import { checkPage, newPage, signInAs, signInExaminer } from './helpers';

/*
 * Invite-only exams, question bank + shuffle, the draft → published → locked → closed lifecycle,
 * role separation (non-examiners never reach the dashboard), and the remembered theme choice.
 */

const TITLE = 'اختبار المدعوّين — بنك الأسئلة';
const QUESTIONS = ['١ + ١ = ؟', '٢ + ٢ = ؟', '٣ + ٣ = ؟'];

test('invite-only exam with a question bank: roster gate, invitations, lock, close and duplicate', async ({
  browser,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const invited = `invited-${stamp}@students.test`;
  const outsider = `outsider-${stamp}@students.test`;

  const examiner = await newPage(browser);
  await signInExaminer(examiner, `roster-${testInfo.project.name}`);

  /* ---------------------------------------------------------------- Theme: remembered per person */
  await examiner.getByRole('button', { name: 'التبديل إلى الوضع الليلي' }).click();
  await expect(examiner.locator('html')).toHaveAttribute('data-theme', 'dark');
  await examiner.reload();
  await expect(examiner.locator('html')).toHaveAttribute('data-theme', 'dark');
  await checkPage(examiner);
  await examiner.getByRole('button', { name: 'التبديل إلى الوضع النهاري' }).click();
  await expect(examiner.locator('html')).toHaveAttribute('data-theme', 'light');

  /* ---------------------------------------------------------------- Draft with bank + roster */
  await examiner.getByRole('link', { name: 'اختبار جديد' }).click();
  await examiner.getByLabel('عنوان الاختبار').fill(TITLE);
  await examiner.getByRole('button', { name: '+ سؤال اختيار من متعدِّد' }).click();
  await examiner.getByRole('button', { name: '+ سؤال اختيار من متعدِّد' }).click();
  for (const [i, prompt] of QUESTIONS.entries()) {
    await examiner.getByLabel('نصّ السؤال', { exact: true }).nth(i).fill(prompt);
    const options = examiner.getByRole('group', { name: `خيارات السؤال ${i + 1}` });
    await options.getByLabel('نصّ الخيار 1', { exact: true }).fill('صحيح');
    await options.getByLabel('نصّ الخيار 2', { exact: true }).fill('خطأ');
    await options.getByLabel('تحديد الخيار 1 إجابةً صحيحة').check();
  }
  await examiner.getByLabel('ترتيب عشوائي للأسئلة').check();
  await examiner.getByLabel('ترتيب عشوائي لخيارات الإجابة').check();

  // A bank larger than the question pool is rejected in Arabic.
  await examiner.getByLabel('عدد الأسئلة المسحوبة لكل مُختبَر').fill('5');
  await examiner.getByLabel('مَن يمكنه أداء الاختبار؟').selectOption('ROSTER');
  await examiner.getByLabel(/قائمة المدعوّين/).fill(`${invited}\nnot-an-email`);
  await examiner.getByRole('button', { name: 'حفظ كمسودة' }).click();
  await expect(examiner.getByText(/لا يمكن سحب/)).toBeVisible();
  // The message quotes the examiner's own (Latin) input, so the translation scan is skipped here.
  await expect(examiner.getByText(/not-an-email/)).toBeVisible();

  await examiner.getByLabel('عدد الأسئلة المسحوبة لكل مُختبَر').fill('2');
  await examiner.getByLabel(/قائمة المدعوّين/).fill(invited);
  await examiner.getByRole('button', { name: 'حفظ كمسودة' }).click();
  await expect(examiner.getByRole('heading', { name: 'المسودة محفوظة' })).toBeVisible();
  await checkPage(examiner);
  const shareUrl = (await examiner.getByTestId('share-url').textContent())!.trim();
  const code = (await examiner.getByTestId('share-code').textContent())!.trim();
  await expect(examiner.getByTestId('share-message')).toContainText(code);

  /* ---------------------------------------------------------------- Drafts cannot be started */
  const visitor = await newPage(browser);
  await visitor.goto(shareUrl);
  await expect(visitor.getByText('لم يُنشَر هذا الاختبار بعد.', { exact: false })).toBeVisible();
  await checkPage(visitor);

  /* ---------------------------------------------------------------- Publish from the dashboard */
  await examiner.getByRole('link', { name: 'متابعة النتائج مباشرةً' }).click();
  const lifecycle = examiner.getByTestId('lifecycle');
  await expect(lifecycle).toContainText('مسودة');
  await expect(lifecycle).toContainText('المدعوّون فقط');
  await lifecycle.getByRole('button', { name: 'نشر الاختبار' }).click();
  await expect(lifecycle).toContainText('منشور');

  /* ---------------------------------------------------------------- Not on the roster */
  await visitor.reload();
  await expect(visitor.getByTestId('roster-gate')).toBeVisible();
  await checkPage(visitor);
  await visitor.getByTestId('roster-gate').getByRole('link', { name: 'تسجيل الدخول' }).click();
  await signInAs(visitor, outsider, 'Outsider');
  await expect(visitor).toHaveURL(new RegExp(`/take/${code}$`));
  await visitor.getByRole('button', { name: 'ابدأ الاختبار' }).click();
  await expect(visitor.getByText('حسابك غير مدرج في قائمة المدعوّين لهذا الاختبار.')).toBeVisible();
  await checkPage(visitor);

  // A non-examiner account never reaches the dashboard.
  await visitor.goto('/examiner');
  await expect(visitor).toHaveURL(/\/\?notExaminer=1$/);
  await expect(visitor.getByText('هذا الحساب ليس من حسابات المُمتحِنين المعتمدة', { exact: false })).toBeVisible();
  await checkPage(visitor);

  /* ---------------------------------------------------------------- Invited candidate */
  const candidate = await newPage(browser);
  await candidate.goto('/');
  await checkPage(candidate);
  await candidate.getByRole('link', { name: 'تسجيل الدخول' }).first().click();
  await signInAs(candidate, invited, 'Invited');
  await expect(candidate).toHaveURL(/\/$/);
  const invitation = candidate.getByTestId('invitations').getByRole('link', { name: new RegExp(TITLE) });
  await expect(invitation).toBeVisible();
  await checkPage(candidate);
  await invitation.click();

  await expect(candidate.getByText(invited)).toBeVisible(); // «تدخل بحساب …»
  await expect(candidate.getByText('سؤالان')).toBeVisible(); // the bank draws two of three
  await candidate.getByRole('button', { name: 'ابدأ الاختبار' }).click();

  const nav = candidate.getByRole('navigation', { name: 'خريطة الأسئلة' });
  await expect(nav.getByRole('button')).toHaveCount(2);
  await checkPage(candidate);
  for (let i = 0; i < 2; i++) {
    await candidate.locator('exam-question-card').nth(i).getByRole('radio', { name: 'صحيح' }).check();
  }
  await expect(candidate.getByTestId('save-state')).toContainText('حُفِظت إجاباتك على الخادم');
  await candidate.getByRole('button', { name: 'تسليم الإجابات' }).click();
  await candidate.getByRole('button', { name: 'نعم، سلِّم الآن' }).click();
  // Options were shuffled per candidate, yet grading maps them back: full marks.
  await expect(candidate.getByTestId('result-score')).toHaveText('٢ من ٢');
  await checkPage(candidate);

  /* ---------------------------------------------------------------- Locked after the first start */
  const row = examiner.getByTestId('candidates').locator('tbody tr').first();
  await expect(row.getByTestId('score')).toHaveText('٢ من ٢');
  await expect(lifecycle).toContainText('مُجمَّد منذ بدء أول مُختبَر');
  await lifecycle.getByRole('link', { name: 'المدعوّون والحالة' }).click();
  await expect(examiner.getByTestId('locked')).toBeVisible();
  await expect(examiner.getByLabel('عنوان الاختبار')).toBeDisabled();
  await expect(examiner.getByLabel(/قائمة المدعوّين/)).toBeEnabled();
  await checkPage(examiner);
  await examiner.getByRole('link', { name: 'العودة إلى اللوحة' }).click();

  /* ---------------------------------------------------------------- Close, then duplicate */
  await lifecycle.getByRole('button', { name: 'إغلاق الاختبار' }).click();
  await expect(lifecycle).toContainText('مغلق');
  await visitor.goto(shareUrl);
  await expect(visitor.getByText('أغلق المُمتحِن هذا الاختبار', { exact: false })).toBeVisible();

  await lifecycle.getByRole('button', { name: 'نسخ إلى مسودة جديدة' }).click();
  await expect(examiner.getByRole('heading', { name: 'تعديل الاختبار' })).toBeVisible();
  await expect(examiner.getByLabel('عنوان الاختبار')).toHaveValue(`${TITLE} (نسخة)`);
  await expect(examiner.getByLabel('عنوان الاختبار')).toBeEnabled();
  await checkPage(examiner);

  for (const page of [examiner, visitor, candidate]) await page.context().close();
});
