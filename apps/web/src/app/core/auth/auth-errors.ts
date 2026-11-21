import { PASSWORD_CHANGE_REQUIRED } from '@cdls/shared';

/** The 403 body says the temporary password must be changed (`code`; `error` from APIs before Nov 2026). */
export function passwordChangeRequired(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  return Object.entries(body).some(
    ([key, value]) => (key === 'code' || key === 'error') && value === PASSWORD_CHANGE_REQUIRED,
  );
}
