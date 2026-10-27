import { afterEach, describe, expect, it } from 'vitest';
import { throttleLimit } from './throttle-limits.js';

describe('throttleLimit', () => {
  const saved = process.env['LOGIN_THROTTLE_LIMIT'];
  afterEach(() => {
    if (saved === undefined) delete process.env['LOGIN_THROTTLE_LIMIT'];
    else process.env['LOGIN_THROTTLE_LIMIT'] = saved;
  });

  it('reads the environment on every call and falls back to the default of Env', () => {
    const limit = throttleLimit('LOGIN_THROTTLE_LIMIT');
    delete process.env['LOGIN_THROTTLE_LIMIT'];
    expect(limit()).toBe(5);
    process.env['LOGIN_THROTTLE_LIMIT'] = '40';
    expect(limit()).toBe(40);
  });

  it('ignores a value that is not a positive whole number', () => {
    const limit = throttleLimit('LOGIN_THROTTLE_LIMIT');
    for (const bad of ['0', '-3', '2.5', 'abc', '']) {
      process.env['LOGIN_THROTTLE_LIMIT'] = bad;
      expect(limit()).toBe(5);
    }
  });
});
