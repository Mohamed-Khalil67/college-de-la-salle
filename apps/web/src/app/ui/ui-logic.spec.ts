import { describe, expect, it } from 'vitest';
import { isValidMark, markText, parseMark } from './marks';
import { pageWindow } from './page-window';
import { tabTarget } from './tab-keys';

describe('parseMark', () => {
  it('reads a decimal comma or point', () => {
    expect(parseMark('12,5')).toBe(12.5);
    expect(parseMark(' 9.25 ')).toBe(9.25);
  });
  it('treats an empty cell as no mark', () => {
    expect(parseMark('')).toBeNull();
    expect(parseMark('   ')).toBeNull();
  });
  it('returns NaN for text that is not a number', () => {
    expect(parseMark('abs')).toBeNaN();
  });
});

describe('isValidMark', () => {
  it('accepts empty and 0 to outOf', () => {
    expect(isValidMark(null)).toBe(true);
    expect(isValidMark(0)).toBe(true);
    expect(isValidMark(20)).toBe(true);
    expect(isValidMark(8, 10)).toBe(true);
  });
  it('rejects out-of-range and non-numbers', () => {
    expect(isValidMark(-1)).toBe(false);
    expect(isValidMark(20.5)).toBe(false);
    expect(isValidMark(11, 10)).toBe(false);
    expect(isValidMark(Number.NaN)).toBe(false);
  });
});

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });
  it('keeps first, last and neighbours with gaps', () => {
    expect(pageWindow(5, 20)).toEqual([1, null, 4, 5, 6, null, 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, null, 20]);
  });
});

describe('tabTarget', () => {
  it('moves with arrows and wraps around', () => {
    expect(tabTarget('ArrowRight', 0, 3)).toBe(1);
    expect(tabTarget('ArrowRight', 2, 3)).toBe(0);
    expect(tabTarget('ArrowLeft', 0, 3)).toBe(2);
  });
  it('jumps with Home and End and ignores other keys', () => {
    expect(tabTarget('Home', 2, 3)).toBe(0);
    expect(tabTarget('End', 0, 3)).toBe(2);
    expect(tabTarget('Enter', 1, 3)).toBeNull();
  });
});

describe('markText', () => {
  const format = (n: number) => String(n).replace('.', ',');
  it('keeps a half-typed mark while the teacher types', () => {
    expect(markText(parseMark('12,'), '12,', format)).toBe('12,');
    expect(markText(12.5, '12,5', format)).toBe('12,5');
    expect(markText(12, '12,0', format)).toBe('12,0');
  });
  it('shows a value set from outside', () => {
    expect(markText(14, '12,5', format)).toBe('14');
    expect(markText(null, '12', format)).toBe('');
    expect(markText(9.5, undefined, format)).toBe('9,5');
  });
});
