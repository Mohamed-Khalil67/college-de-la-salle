import { describe, expect, it } from 'vitest';
import { fieldValue, shownError } from './forms';

describe('shownError', () => {
  it('waits until the field was touched', () => {
    const errors = () => [{ message: 'Saisissez le nom.' }];
    expect(shownError({ touched: () => false, errors })).toBeNull();
    expect(shownError({ touched: () => true, errors })).toBe('Saisissez le nom.');
    expect(shownError({ touched: () => true, errors: () => [] })).toBeNull();
  });
});

describe('fieldValue', () => {
  // A control is anything with a string `value`; Node's EventTarget stands in for the element.
  const readFrom = (control: object): string => {
    const target = Object.assign(new EventTarget(), control);
    let seen = 'unset';
    target.addEventListener('change', (e) => (seen = fieldValue(e)));
    target.dispatchEvent(new Event('change'));
    return seen;
  };

  it('reads the value of a field, a select or a text area', () => {
    expect(readFrom({ value: 'b' })).toBe('b');
    expect(readFrom({ value: '' })).toBe('');
  });

  it('answers an empty string for an event that does not come from a control', () => {
    expect(fieldValue(new Event('change'))).toBe('');
    expect(readFrom({})).toBe('');
    expect(readFrom({ value: 3 })).toBe('');
  });
});
