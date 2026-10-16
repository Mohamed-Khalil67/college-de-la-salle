import { normalizeAccessCode } from '@exam/contracts';
import {
  daysInMonth,
  describeLocalDateTime,
  hourOptions,
  joinLocalDateTime,
  minuteOptions,
  monthOptions,
  splitLocalDateTime,
} from './arabic-datetime';
import { toAppDigits } from './arabic-format';

describe('Arabic date-time helpers', () => {
  it('round-trips datetime-local strings', () => {
    const parts = splitLocalDateTime('2026-10-16T09:05')!;
    expect(parts).toEqual({ year: 2026, month: 10, day: 16, hour: 9, minute: 5 });
    expect(joinLocalDateTime(parts)).toBe('2026-10-16T09:05');
  });

  it('clamps the day when the month gets shorter (31 March → February)', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(joinLocalDateTime({ year: 2026, month: 2, day: 31, hour: 0, minute: 0 })).toBe('2026-02-28T00:00');
  });

  it('labels months, hours and minutes in Arabic', () => {
    expect(monthOptions()[0].label).toMatch(/يناير|كانون/);
    expect(hourOptions()[0].label).toMatch(/١٢\s?ص/);
    expect(hourOptions()[13].label).toMatch(/١\s?م/);
    expect(minuteOptions().map((o) => o.label).slice(0, 3)).toEqual(['٠٠', '٠٥', '١٠']);
    expect(minuteOptions(7).some((o) => o.value === 7)).toBe(true);
  });

  it('writes the chosen moment out in full', () => {
    const text = describeLocalDateTime('2026-10-16T11:09');
    expect(text).toContain('الجمعة');
    expect(text).toContain('٢٠٢٦');
  });

  it('shows typed digits in the app script', () => {
    expect(toAppDigits('45')).toBe('٤٥');
    expect(toAppDigits('2.5')).toBe('٢٫٥');
    expect(toAppDigits('۴۲')).toBe('٤٢');
  });
});

describe('access codes typed on an Arabic keyboard', () => {
  it('accepts Arabic-Indic and Persian digits', () => {
    expect(normalizeAccessCode('abc٢٣٤')).toBe('ABC234');
    expect(normalizeAccessCode('ABC۲۳۴')).toBe('ABC234');
  });
});
