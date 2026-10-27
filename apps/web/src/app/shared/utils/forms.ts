/** The part of a Signal Forms field state that `shownError` reads. */
export interface FieldErrorState {
  touched(): boolean;
  errors(): readonly { readonly message?: string }[];
}

/** First error message of a Signal Forms field once the user has left it (or tried to submit). */
export function shownError(state: FieldErrorState): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}
