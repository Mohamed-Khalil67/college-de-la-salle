# AsyncState reference

## The shared file (`shared/utils/async-state.ts`)
```ts
import { Observable, OperatorFunction, catchError, map, of, startWith } from 'rxjs';

export type AsyncState<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: E };

export const idle = <T, E = Error>(): AsyncState<T, E> => ({ status: 'idle' });

/** Emits loading, then success or error. Never errors out, so it is safe inside switchMap. */
export function toAsyncState<T, E = Error>(): OperatorFunction<T, AsyncState<T, E>> {
  return (source: Observable<T>) =>
    source.pipe(
      map((data): AsyncState<T, E> => ({ status: 'success', data })),
      startWith<AsyncState<T, E>>({ status: 'loading' }),
      catchError((error: E) => of<AsyncState<T, E>>({ status: 'error', error })),
    );
}
```
Notes: HTTP errors arrive as `HttpErrorResponse`, so type `E` as that (or map to a friendly message) where it matters. Do not swallow errors silently; the `error` state must reach the UI.

## Imperative style (a button action, such as login or create)
```ts
readonly state = signal<AsyncState<User>>({ status: 'idle' });

submit(): void {
  if (this.state().status === 'loading') return;      // block double submit
  this.state.set({ status: 'loading' });
  this.api.createUser(this.form.getRawValue()).subscribe({
    next: (data) => this.state.set({ status: 'success', data }),
    error: (error: unknown) =>
      this.state.set({ status: 'error', error: error instanceof Error ? error : new Error('Request failed') }),
  });
}
```
Disable the submit button with `[disabled]="state().status === 'loading'"` and keep the form values on error so the user can retry. Subscriptions to `HttpClient` complete on their own; for long-lived streams use `takeUntilDestroyed()`.

## Declarative style (search)
```ts
private readonly query = signal('');

readonly results = toSignal(
  toObservable(this.query).pipe(
    debounceTime(300),
    distinctUntilChanged(),
    switchMap((q) => (q.trim().length < 2 ? of(idle<Course[]>()) : this.api.search(q).pipe(toAsyncState()))),
  ),
  { initialValue: idle<Course[]>() },
);
```
- `switchMap` cancels the previous request when the user keeps typing.
- `toAsyncState()` is on the inner observable, so one failed search does not kill the stream.
- Stale data: if you want to keep the previous results visible while loading, hold the last success in a separate `linkedSignal` or `computed`; do not add flags to the union.

## Streaming (chunks that accumulate)
```ts
readonly answer = toSignal(
  this.ai.stream(prompt).pipe(
    scan((text, chunk) => text + chunk, ''),
    toAsyncState(),
  ),
  { initialValue: idle<string>() },
);
```
Every chunk emits a new `success` with the text so far; `loading` is shown only before the first chunk.

## Template
```html
@let s = state();
@switch (s.status) {
  @case ('loading') { <app-spinner role="status" aria-label="Loading" /> }
  @case ('error') { <p role="alert">{{ s.error.message }}</p> }
  @case ('success') { <app-user-card [user]="s.data" /> }
}
```
`@switch` on `status` narrows `s` inside each `@case`. With `@if`, test `s.status === 'success'` before reading `s.data`. Under `strictTemplates`, a typo in a status string is a compile error.

## Checklist
- One `AsyncState` per independent request; do not share one state between unrelated calls.
- Exhaustive handling: every status has UI (including `idle` and `error`).
- Errors are visible and announced (`role="alert"`); loading is announced (`role="status"`).
- Tests: cover idle → loading → success and idle → loading → error.
