import { arabicErrorMessage } from './arabic-errors';
import {
  formatClock,
  formatCount,
  formatDate,
  formatNumber,
  formatScore,
  parseLocalizedNumber,
} from './arabic-format';

const LRI = '⁦';
const PDI = '⁩';

describe('Arabic formatting', () => {
  it('uses Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(formatNumber(1234)).toBe('١٬٢٣٤');
    expect(formatNumber(2.5)).toBe('٢٫٥');
  });

  it('formats the countdown as an LTR-isolated mm:ss clock', () => {
    expect(formatClock(297_000)).toBe(`${LRI}٠٤:٥٧${PDI}`);
    expect(formatClock(1)).toBe(`${LRI}٠٠:٠١${PDI}`); // rounds up: never shows 00:00 early
    expect(formatClock(3_725_000)).toBe(`${LRI}١:٠٢:٠٥${PDI}`);
    expect(formatClock(-5)).toBe(`${LRI}٠٠:٠٠${PDI}`);
  });

  it('can switch to Western digits with a locale', () => {
    expect(formatClock(297_000, 'ar-u-nu-latn')).toBe(`${LRI}04:57${PDI}`);
  });

  it('applies all six Arabic plural categories', () => {
    expect(formatCount(0, 'question')).toBe('لا أسئلة');
    expect(formatCount(1, 'question')).toBe('سؤال واحد');
    expect(formatCount(2, 'question')).toBe('سؤالان');
    expect(formatCount(3, 'question')).toBe('٣ أسئلة');
    expect(formatCount(11, 'question')).toBe('١١ سؤالًا');
    expect(formatCount(100, 'question')).toBe('١٠٠ سؤال');
    expect(formatCount(5, 'minute')).toBe('٥ دقائق');
    expect(formatCount(2.5, 'point')).toBe('٢٫٥ درجة');
  });

  it('formats scores as "x من y" (bidi-safe, unlike "x / y")', () => {
    expect(formatScore(3, 5)).toBe('٣ من ٥');
  });

  it('formats dates with Arabic month names', () => {
    const text = formatDate(Date.UTC(2026, 9, 16, 12), 'date');
    expect(text).toMatch(/أكتوبر|تشرين/);
    expect(text).toMatch(/[٠-٩]/);
  });

  it('parses digits typed in any script', () => {
    expect(parseLocalizedNumber('١٢٫٥')).toBe(12.5);
    expect(parseLocalizedNumber('۴۲')).toBe(42);
    expect(parseLocalizedNumber('7')).toBe(7);
  });
});

describe('arabicErrorMessage', () => {
  it('passes through Arabic server messages', () => {
    expect(arabicErrorMessage({ code: 'functions/failed-precondition', message: 'لم يُتَح هذا الاختبار بعد.' })).toBe(
      'لم يُتَح هذا الاختبار بعد.',
    );
  });

  it('maps SDK error codes and never leaks English text', () => {
    expect(arabicErrorMessage({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe(
      'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
    );
    expect(arabicErrorMessage({ code: 'functions/unavailable', message: 'unavailable' })).toMatch(/الخادم/);
    expect(arabicErrorMessage(new Error('boom'))).toBe('حدث خطأ غير متوقَّع. أعد المحاولة.');
  });
});
