---
name: angular-patterns
description: Angular patterns and gotchas - async state as a discriminated union (AsyncState instead of loading/error boolean flags), @let type narrowing in templates, declarative RxJS streams for search and streaming, signals with ngModel and form inputs, and fixing ng serve port collisions or orphaned Node processes on Windows. Use when the user says loading and error state, isLoading flag, AsyncState, @let, search as you type, ngModel with signals not working, two-way binding, port 4200 already in use, or ng serve won't start.
---

# Angular patterns and gotchas

Check the project's Angular version first (`package.json`). `@let` needs Angular 18.1+ (stable in 19), signal two-way binding to `ngModel` needs 17.2+, and `model()` needs 17.2+. Follow the project's existing conventions if they already have an async-state helper; reuse it instead of adding a second one.

## 1. Async state: no boolean soup
Do not model one request with several flags (`isLoading`, `hasError`, `data`, `errorMessage`): they can contradict each other (loading and error both true) and every template needs manual guards.

Use one discriminated union per request and a single signal:
```ts
type AsyncState<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: E };
```
- Impossible states cannot be represented; `data` exists only when `status === 'success'`.
- Guard double submits by checking `status === 'loading'` before starting a request.
- Keep the type and `toAsyncState()` helper in one shared file (for example `shared/utils/async-state.ts`). Full code, the imperative and declarative styles, and the template pattern are in `references/async-state.md`.

## 2. Templates: `@let` narrowing
Read the signal once into an `@let`, then branch on `status`; the compiler narrows the union inside each branch (no `!`, no `as`):
```html
@let s = state();
@switch (s.status) {
  @case ('loading') { <app-spinner /> }
  @case ('error') { <p role="alert">{{ s.error.message }}</p> }
  @case ('success') { <app-result [data]="s.data" /> }
}
```
`@let` variables are read-only and scoped to the template block. Do not call the signal repeatedly (`state().data` after `@if (state().status === ...)` does not narrow). Include an accessible loading and error announcement (`role="status"`, `role="alert"`).

## 3. Declarative streams
For search-as-you-type, polling and streaming, put `toAsyncState()` on the **inner** observable inside `switchMap`, then `toSignal` with an `idle` initial value. Do not put `catchError` on the outer stream (the first error would end it). See `references/async-state.md`.

## 4. Signals and form inputs
Binding inputs to signals has a few traps; the three safe patterns and the exact failure cases are in `references/signals-and-forms.md`. Short version: bind a writable signal reference directly (`[(ngModel)]="name"`, no parentheses), or split into `[ngModel]="name()"` plus `(ngModelChange)="name.set($event)"`. Prefer the project's form strategy (reactive forms, or Signal Forms where its Angular version supports them) for anything beyond a single field.

## 5. Dev server problems on Windows
`ng serve` fails or serves a stale app because an orphaned Node process still holds the port. Diagnose and clear it with the commands in `references/dev-server-windows.md`; confirm the process before killing it and never kill by name.

## Verify
1. Read the project's commands from `package.json` (`ng build`, lint, tests). Do not invent any.
2. Run the typecheck/build; narrowing mistakes show up as type errors under `strictTemplates`.
3. Run the affected tests and, if a browser tool is connected, exercise the loading, error and success states once each. Report what was and was not checked.
