import { expect, test } from '@playwright/test';
import { SUPER_ADMIN_EMAIL } from './global-setup';
import { checkPage, newPage, signInAs } from './helpers';

/*
 * Zero-trust RBAC end to end: the bootstrapped super admin grants examiner rights to an ordinary
 * account; that user refreshes their claims (no sign-out) and schedules an exam; the revocation
 * then takes effect and both changes appear in the immutable audit log.
 */
test('super admin grants examiner rights; the user refreshes claims and schedules an exam; revocation is enforced', async ({
  browser,
}, testInfo) => {
  const teacherEmail = `teacher-${testInfo.project.name}-${Date.now()}@staff.test`;

  /* -------------------------------------------- Super admin opens the Arabic admin console */
  const admin = await newPage(browser);
  await admin.goto('/sign-in');
  await signInAs(admin, SUPER_ADMIN_EMAIL, 'المشرف العام');
  await expect(admin).toHaveURL(/\/admin$/);
  await expect(admin.getByRole('heading', { name: 'إدارة صلاحيات المعلّمين' })).toBeVisible();
  await checkPage(admin);

  /* -------------------------------------------- An ordinary account is not an examiner */
  const teacher = await newPage(browser);
  await teacher.goto('/sign-in');
  await signInAs(teacher, teacherEmail, 'Teacher');
  await expect(teacher).toHaveURL(/\/exams$/);
  await teacher.goto('/examiner');
  await expect(teacher).toHaveURL(/\/exams\?notAllowed=examiner$/);
  await teacher.goto('/admin');
  await expect(teacher).toHaveURL(/\/exams\?notAllowed=super_admin$/);
  await expect(teacher.getByText('هذه الصفحة مقصورة على المشرف العام.')).toBeVisible();

  /* -------------------------------------------- Grant */
  await admin.getByLabel('البريد الإلكتروني أو النطاق').fill('not-an-email');
  await admin.getByRole('button', { name: 'منح صلاحية المعلّم' }).click();
  await expect(admin.getByText(/أدخِل بريدًا صحيحًا/)).toBeVisible();

  await admin.getByLabel('البريد الإلكتروني أو النطاق').fill(teacherEmail);
  await admin.getByRole('button', { name: 'منح صلاحية المعلّم' }).click();
  await expect(admin.getByTestId('admin-feedback')).toContainText('مُنِحت صلاحية المعلّم');
  await expect(admin.getByTestId('admin-feedback')).toContainText('حساب واحد');
  const row = admin.getByTestId('directory').locator('tbody tr', { has: admin.getByText(teacherEmail, { exact: true }) });
  await expect(row.getByTestId('status')).toHaveText('نشطة');
  await expect(admin.getByTestId('audit-log')).toContainText(teacherEmail);
  await checkPage(admin);

  // Search filters the directory live.
  await admin.getByLabel('بحث في الدليل').fill(teacherEmail);
  await expect(admin.getByTestId('entry')).toHaveCount(1);
  await admin.getByLabel('بحث في الدليل').fill('');

  /* -------------------------------------------- The user refreshes claims and schedules an exam */
  // Still on the page they were sent to — no reload, no sign-out: an explicit claims refresh.
  await expect(teacher).toHaveURL(/\/exams\?notAllowed=super_admin$/);
  await teacher.getByRole('button', { name: 'تحديث صلاحياتي' }).click();
  await expect(teacher).toHaveURL(/\/examiner$/);
  await expect(teacher.getByRole('heading', { name: 'الاختبارات والنتائج المباشرة' })).toBeVisible();

  await teacher.getByRole('link', { name: 'اختبار جديد' }).click();
  await teacher.getByLabel('عنوان الاختبار').fill('اختبار الكيمياء الكهربية');
  await teacher.getByLabel('المدة (بالدقائق)').fill('20');
  await teacher.getByLabel('نصّ السؤال', { exact: true }).first().fill('ما القطب الموجب في الخلية الجلفانية؟');
  await teacher.getByLabel('نصّ الخيار 1', { exact: true }).fill('الكاثود');
  await teacher.getByLabel('نصّ الخيار 2', { exact: true }).fill('الأنود');
  await teacher.getByLabel('تحديد الخيار 1 إجابةً صحيحة').check();
  await teacher.getByLabel('المادة الدراسية').selectOption('physics-chemistry');
  await teacher.getByRole('button', { name: 'نشر الاختبار' }).click();
  await expect(teacher.getByRole('heading', { name: 'شارِك الاختبار مع المُختبَرين' })).toBeVisible();
  await checkPage(teacher);

  /* -------------------------------------------- Revoke: immediate, and audited */
  await row.getByRole('button', { name: /سحب/ }).click();
  await expect(admin.getByTestId('admin-feedback')).toContainText('سُحِبت صلاحية المعلّم');
  await expect(row.getByTestId('status')).toHaveText('مسحوبة');
  await expect(admin.getByTestId('audit-log').getByText('سحب صلاحية المعلّم').first()).toBeVisible();

  // The revoked session can no longer reach the dashboard: either the revoked refresh token signs
  // the user out, or the refreshed claim says examinee.
  await teacher.goto('/examiner');
  await expect(teacher).toHaveURL(/\/(sign-in|exams\?notAllowed=examiner)/);
  await expect(teacher.getByRole('heading', { name: 'الاختبارات والنتائج المباشرة' })).toHaveCount(0);

  await admin.context().close();
  await teacher.context().close();
});
