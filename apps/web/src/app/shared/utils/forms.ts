/** The part of a Signal Forms field state that `shownError` reads. */
export interface FieldErrorState {
  touched(): boolean;
  errors(): readonly { readonly message?: string }[];
}

/** First error message of a Signal Forms field once the user has left it (or tried to submit). */
export function shownError(state: FieldErrorState): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}

/**
 * The text a change or input event carries (a field, a select or a text area), or an empty string when the event
 * does not come from a control with a string value. Narrows by shape instead of casting, and needs no browser
 * global (public pages are prerendered).
 */
export function fieldValue(event: Event): string {
  const target = event.target;
  if (target !== null && 'value' in target && typeof target.value === 'string') return target.value;
  return '';
}
