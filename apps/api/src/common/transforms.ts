/** class-transformer helpers for DTOs. */
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** `''` → null, for optional foreign keys sent by forms. */
export const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

/** `'true'` / `'false'` from the query string. */
export const queryBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
