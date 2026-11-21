import { passwordChangeRequired } from './auth-errors';

describe('passwordChangeRequired', () => {
  it('reads the code, and the older error field', () => {
    expect(passwordChangeRequired({ statusCode: 403, code: 'PASSWORD_CHANGE_REQUIRED' })).toBe(true);
    expect(passwordChangeRequired({ statusCode: 403, error: 'PASSWORD_CHANGE_REQUIRED' })).toBe(true);
  });

  it('says no for any other 403 body', () => {
    expect(passwordChangeRequired({ statusCode: 403, message: 'Accès refusé.' })).toBe(false);
    expect(passwordChangeRequired({ message: 'PASSWORD_CHANGE_REQUIRED' })).toBe(false);
    expect(passwordChangeRequired(null)).toBe(false);
    expect(passwordChangeRequired('PASSWORD_CHANGE_REQUIRED')).toBe(false);
  });
});
