import { describe, expect, it } from 'vitest';
import { shownError } from './forms';

describe('shownError', () => {
  it('waits until the field was touched', () => {
    const errors = () => [{ message: 'Saisissez le nom.' }];
    expect(shownError({ touched: () => false, errors })).toBeNull();
    expect(shownError({ touched: () => true, errors })).toBe('Saisissez le nom.');
    expect(shownError({ touched: () => true, errors: () => [] })).toBeNull();
  });
});
