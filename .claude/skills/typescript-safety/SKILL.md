---
name: typescript-safety
description: Keeps Angular TypeScript type-safe - strict compiler settings and strictTemplates, no any, typed signal inputs, outputs, forms and routes, safe API data, and a typecheck gate before finishing. Use when the user says type safety, fix type errors, remove any, add types, strict mode, typed forms, or when writing or reviewing any Angular TypeScript code.
---

# TypeScript safety (Angular)

## Rules
- Respect the project's `tsconfig` strictness and Angular's `strictTemplates`. Never loosen compiler options to make an error go away. If tightening them is worthwhile, propose it separately.
- No `any` in new code. Use `unknown` and narrow it (type guards, `in`, `instanceof`, discriminated unions). Avoid `as` casts and `!` non-null assertions; when one is truly needed, add a one-line comment saying why it is safe.
- Data from outside the app (HTTP responses, `localStorage`, `postMessage`, URL params, JSON) is `unknown` until validated. The generic type parameter on `HttpClient` calls is only a claim, not a check. Validate at the boundary with the project's existing validator (zod, valibot, a type guard) rather than adding a dependency; ask first if there is none and the data is risky.
- Model states with discriminated unions (`{ status: 'loading' } | { status: 'ok'; data: T } | ...`) instead of several optional fields. Make `switch` statements exhaustive with a `never` check.
- Export explicit types for public contracts (component inputs and outputs, service methods, store state). Let inference work for locals.
- Do not use `@ts-ignore`; use `@ts-expect-error` with a reason only as a last resort.

## Angular specifics
- Use typed signal APIs where the project's Angular version has them: `input.required<T>()`, `output<T>()`, `model<T>()`, `viewChild<T>()`.
- Forms: typed reactive forms (`FormControl<string>`, `NonNullableFormBuilder`), or Signal Forms where the project's version supports them. Do not use untyped `FormGroup`.
- Type route params, resolvers and guards. Do not type `HttpClient` responses as `any`.
- Keep injection tokens typed (`InjectionToken<T>`).

## Verify
1. Find the typecheck command in `package.json` (`ng build`, `tsc --noEmit -p tsconfig.app.json`, `typecheck`, or the project's build). Do not invent one; if none exists, run `npx tsc --noEmit -p <tsconfig>` and say so.
2. Run it, plus the linter and tests. A typecheck failure means the work is not done.
3. Report any `any`, cast or assertion you had to add, with the reason.
