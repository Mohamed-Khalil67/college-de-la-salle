# Signals and form inputs

Angular's own forms guide shows a plain writable signal bound with `[(ngModel)]="favoriteColor"` (no parentheses after the name) and that works in current versions. Failures come from specific cases, listed below. If a project hit a runtime error that this list does not explain, reproduce it first and check the Angular version before applying a workaround.

## What fails
| Template | Why |
|---|---|
| `[(ngModel)]="name()"` | A call expression cannot be written back. Compile error ("unsupported expression in two-way binding"). |
| `[(ngModel)]="doubled"` where `doubled` is `computed()` or an `input()` | Read-only signals have no `set`. Use a writable `signal()` or `model()`. |
| `[(ngModel)]="user().name"` | Edits a property inside the signal's object; the signal never changes, so dependents (`computed`, templates reading `user()`) do not update. |
| A version older than 17.2 | Two-way binding to signals did not exist. Check `@angular/core` and `@angular/forms` versions. |
| `signal` imported but the class field is a plain `let` or getter that returns a new value each call | The binding writes to a temporary. |

## Three safe patterns
**1. Plain writable signal, bound directly** (when the version supports it):
```html
<input [(ngModel)]="name" />
```
```ts
name = signal('');
```
**2. Decomposed binding** (always works, and the right choice for object state):
```html
<input [ngModel]="user().name" (ngModelChange)="user.update(u => ({ ...u, name: $event }))" />
```
Use an immutable update so dependents re-evaluate.

**3. Getter/setter over a signal** (when a directive needs a plain property):
```ts
private readonly _name = signal('');
get name() { return this._name(); }
set name(value: string) { this._name.set(value); }
```
```html
<input [(ngModel)]="name" />
```

## Custom components
For your own inputs use `model()`: `value = model('')` in the component, `<app-field [(value)]="name" />` in the parent (pass the signal itself, not `name()`).

## Choosing a form approach
- One or two standalone fields: pattern 1 or 2 is fine.
- Anything with validation, multiple fields or submit state: reactive forms, or Signal Forms if the project's Angular version supports them (check `@angular/forms/signals` exists and the project already uses it). Do not mix three form styles in one feature.
- Pair submit state with `AsyncState` (see `async-state.md`).
