import { APP_LOCALE, formatNumber } from './arabic-format';

/*
 * Pure helpers behind <exam-datetime-input>. Values are `datetime-local` strings
 * ("YYYY-MM-DDTHH:mm", browser time zone) so form models stay unchanged.
 */

export interface DateTimeParts {
  readonly year: number;
  readonly month: number; // 1–12
  readonly day: number;
  readonly hour: number; // 0–23
  readonly minute: number;
}

export function splitLocalDateTime(value: string): DateTimeParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return { year: y, month: mo, day: d, hour: h, minute: mi };
}

export function joinLocalDateTime(p: DateTimeParts): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = Math.min(p.day, daysInMonth(p.year, p.month));
  return `${p.year}-${pad(p.month)}-${pad(day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export interface Option {
  readonly value: number;
  readonly label: string;
}

const monthFormat = new Intl.DateTimeFormat(APP_LOCALE, { month: 'long' });
const hourFormat = new Intl.DateTimeFormat(APP_LOCALE, { hour: 'numeric', hour12: true });

export function monthOptions(): Option[] {
  return Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: monthFormat.format(new Date(2000, i, 1)),
  }));
}

/** "١٢ ص", "١ ص" … "١١ م" — 12-hour clock with the Arabic AM/PM markers. */
export function hourOptions(): Option[] {
  return Array.from({ length: 24 }, (_, h) => ({
    value: h,
    label: hourFormat.format(new Date(2000, 0, 1, h)),
  }));
}

export function numberOptions(from: number, to: number, step = 1, pad = 0): Option[] {
  const out: Option[] = [];
  for (let n = from; n <= to; n += step) {
    out.push({ value: n, label: formatNumber(n, { minimumIntegerDigits: pad || 1, useGrouping: false }) });
  }
  return out;
}

/** Minutes in 5-minute steps, plus the current value if it isn't on the grid. */
export function minuteOptions(current?: number): Option[] {
  const opts = numberOptions(0, 55, 5, 2);
  if (current !== undefined && current % 5 !== 0) {
    opts.push({ value: current, label: formatNumber(current, { minimumIntegerDigits: 2 }) });
    opts.sort((a, b) => a.value - b.value);
  }
  return opts;
}

const previewFormat = new Intl.DateTimeFormat(APP_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "الجمعة، ١٦ أكتوبر ٢٠٢٦ في ١١:٠٥ ص" */
export function describeLocalDateTime(value: string): string {
  const p = splitLocalDateTime(value);
  if (!p) return '';
  return previewFormat.format(new Date(p.year, p.month - 1, p.day, p.hour, p.minute));
}
