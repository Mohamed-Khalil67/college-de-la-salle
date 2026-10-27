import { describe, expect, it } from 'vitest';
import { hasNullableNumber, hasNumber, hasString, isRecord, readJsonList } from './json.js';

const isPoint = (v: unknown): v is { x: number; label: string } =>
  isRecord(v) && hasNumber(v, 'x') && hasString(v, 'label');

describe('readJsonList', () => {
  it('keeps the items of the expected shape and drops the others', () => {
    const column: unknown = [{ x: 1, label: 'a' }, { x: '2', label: 'b' }, null, 7, { x: 3, label: 'c', extra: true }];
    expect(readJsonList(column, isPoint)).toEqual([
      { x: 1, label: 'a' },
      { x: 3, label: 'c', extra: true },
    ]);
  });

  it('answers an empty list when the column is not an array', () => {
    expect(readJsonList(null, isPoint)).toEqual([]);
    expect(readJsonList({ x: 1, label: 'a' }, isPoint)).toEqual([]);
    expect(readJsonList('[]', isPoint)).toEqual([]);
  });
});

describe('field checks', () => {
  it('tells a number from NaN, a string and null', () => {
    expect(hasNumber({ n: 1 }, 'n')).toBe(true);
    expect(hasNumber({ n: Number.NaN }, 'n')).toBe(false);
    expect(hasNumber({ n: '1' }, 'n')).toBe(false);
    expect(hasNullableNumber({ n: null }, 'n')).toBe(true);
    expect(hasNullableNumber({}, 'n')).toBe(false);
    expect(isRecord([])).toBe(false);
  });
});
