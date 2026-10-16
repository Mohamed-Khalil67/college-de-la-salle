/**
 * Centralised Arabic formatting on top of the native `Intl` APIs. Every number, clock, date and
 * count shown in the UI goes through here, so switching digits (Arabic-Indic ↔ Latin) or calendar
 * is a one-line change in `APP_LOCALE`.
 *
 * `ar-u-nu-arab` → Arabic-Indic digits (٠١٢٣), Gregorian calendar.
 * Use `ar-u-nu-latn` for Western digits (common in the Maghreb).
 */
export const APP_LOCALE = 'ar-u-nu-arab';

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const pluralRules = new Intl.PluralRules('ar');

export type DateStyle = 'date' | 'time' | 'datetime' | 'short';

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: 'long' },
  time: { timeStyle: 'short' },
  datetime: { dateStyle: 'medium', timeStyle: 'short' },
  short: { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
};

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 1 },
  locale = APP_LOCALE,
): string {
  const key = locale + JSON.stringify(options);
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format.format(value);
}

export function formatDate(epochMs: number, style: DateStyle = 'datetime', locale = APP_LOCALE): string {
  const key = locale + style;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, DATE_OPTIONS[style]);
    dateFormats.set(key, format);
  }
  return format.format(epochMs);
}

/** Countdown clock `mm:ss` (or `h:mm:ss`) in the app's digits. Rounds up so 0 shows only at 0. */
export function formatClock(ms: number, locale = APP_LOCALE): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const two = (n: number) => formatNumber(n, { minimumIntegerDigits: 2, useGrouping: false }, locale);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  // U+2066/U+2069 (LRI/PDI) keep "04:57" from being reordered to "57:04" inside RTL text.
  return `⁦${h ? `${formatNumber(h, {}, locale)}:` : ''}${two(m)}:${two(s)}⁩`;
}

/** "٣ من ٥" — reads naturally in Arabic and avoids the bidi pitfalls of "3 / 5". */
export function formatScore(score: number, max: number, locale = APP_LOCALE): string {
  return `${formatNumber(score, { maximumFractionDigits: 1 }, locale)} من ${formatNumber(max, {}, locale)}`;
}

/* ------------------------------------------------------------------------------------------------
 * Arabic counted nouns. Arabic has six plural categories (zero/one/two/few/many/other); a naive
 * "n + plural" is wrong for most numbers, so every counted noun declares its forms explicitly.
 * `{n}` is replaced by the formatted number.
 * ---------------------------------------------------------------------------------------------- */

export interface PluralForms {
  readonly zero: string;
  readonly one: string;
  readonly two: string;
  readonly few: string;
  readonly many: string;
  readonly other: string;
}

export const NOUNS = {
  minute: {
    zero: 'لا دقائق',
    one: 'دقيقة واحدة',
    two: 'دقيقتان',
    few: '{n} دقائق',
    many: '{n} دقيقة',
    other: '{n} دقيقة',
  },
  question: {
    zero: 'لا أسئلة',
    one: 'سؤال واحد',
    two: 'سؤالان',
    few: '{n} أسئلة',
    many: '{n} سؤالًا',
    other: '{n} سؤال',
  },
  point: {
    zero: 'صفر درجة',
    one: 'درجة واحدة',
    two: 'درجتان',
    few: '{n} درجات',
    many: '{n} درجةً',
    other: '{n} درجة',
  },
  character: {
    zero: 'لا أحرف',
    one: 'حرف واحد',
    two: 'حرفان',
    few: '{n} أحرف',
    many: '{n} حرفًا',
    other: '{n} حرف',
  },
  time: {
    zero: 'ولا مرة',
    one: 'مرة واحدة',
    two: 'مرتين',
    few: '{n} مرات',
    many: '{n} مرةً',
    other: '{n} مرة',
  },
  answer: {
    zero: 'لا إجابات',
    one: 'إجابة واحدة',
    two: 'إجابتان',
    few: '{n} إجابات',
    many: '{n} إجابةً',
    other: '{n} إجابة',
  },
} as const satisfies Record<string, PluralForms>;

export type CountedNoun = keyof typeof NOUNS;

export function formatCount(n: number, noun: CountedNoun | PluralForms, locale = APP_LOCALE): string {
  const forms = typeof noun === 'string' ? NOUNS[noun] : noun;
  // Fractional values (e.g. 2.5 points) take the "other" form in Arabic.
  const category = Number.isInteger(n)
    ? (pluralRules.select(n) as keyof PluralForms)
    : 'other';
  return forms[category].replace('{n}', formatNumber(n, { maximumFractionDigits: 1 }, locale));
}

/** Converts Latin and Persian digits (and the decimal point) in a string to the app's digits. */
export function toAppDigits(text: string, locale = APP_LOCALE): string {
  if (!locale.includes('nu-arab')) return text;
  return text
    .replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)))
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 0x0660))
    .replace(/\./g, '٫');
}

/** Parses digits typed in either script (Arabic-Indic, Persian, Latin) into a number. */
export function parseLocalizedNumber(raw: string): number {
  const western = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');
  return Number(western);
}
