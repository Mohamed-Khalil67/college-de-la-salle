/**
 * Turns any thrown value into a user-facing Modern Standard Arabic sentence.
 *
 * - Cloud Functions already return Arabic messages; those are passed through.
 * - Firebase SDK errors carry stable `code`s ("permission-denied", "functions/unavailable", …)
 *   which are mapped here. Raw English exception text is never shown to users.
 */
const BY_CODE: Record<string, string> = {
  'permission-denied': 'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  unauthenticated: 'انتهت جلستك. سجِّل الدخول مجددًا.',
  'not-found': 'العنصر المطلوب غير موجود.',
  'already-exists': 'هذا العنصر موجود مسبقًا.',
  'failed-precondition': 'لا يمكن تنفيذ الإجراء في الحالة الراهنة.',
  'invalid-argument': 'البيانات المُدخَلة غير صالحة.',
  'resource-exhausted': 'تجاوزت الحدَّ المسموح به من الطلبات. حاول بعد قليل.',
  unavailable: 'تعذَّر الاتصال بالخادم. تحقَّق من اتصالك بالإنترنت ثم أعد المحاولة.',
  'deadline-exceeded': 'استغرق الخادم وقتًا أطول من المعتاد. أعد المحاولة.',
  cancelled: 'أُلغيت العملية.',
  internal: 'حدث خطأ داخلي في الخادم. أعد المحاولة لاحقًا.',
  'popup-blocked': 'منع المتصفح النافذة المنبثقة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.',
  'popup-closed-by-user': 'أُغلقت نافذة تسجيل الدخول قبل إتمامه.',
  'network-request-failed': 'تعذَّر الاتصال بالشبكة. أعد المحاولة.',
};

const FALLBACK = 'حدث خطأ غير متوقَّع. أعد المحاولة.';
const HAS_ARABIC = /[؀-ۿ]/;

export function arabicErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return FALLBACK;
  const { code, message } = error as { code?: unknown; message?: unknown };

  if (typeof message === 'string' && HAS_ARABIC.test(message)) return message;
  if (typeof code === 'string') {
    // "functions/unavailable", "auth/popup-blocked", "permission-denied"
    const bare = code.includes('/') ? code.slice(code.indexOf('/') + 1) : code;
    if (BY_CODE[bare]) return BY_CODE[bare];
  }
  return FALLBACK;
}
