<!-- ai-skills: managed file. Re-running the installer updates it; put project-specific rules in your own docs. -->
# Angular conventions

Only use an API the project's Angular version supports. If a rule needs a newer version, say so and use the closest older equivalent. Types: see [typescript.md](typescript.md). Accessibility: see [accessibility.md](accessibility.md).

## Components
- Standalone components only. Do not set `standalone: true` (the default since v20).
- Do not set `changeDetection: OnPush` explicitly when the project's version defaults to it (v22+).
- `input()`, `output()`, `model()` instead of decorators; `computed()` for derived state; `linkedSignal()` for state that must follow several sources.
- Host bindings go in the `host` object, never `@HostBinding` / `@HostListener`.
- No `ngClass` or `ngStyle`; use `class` and `style` bindings.
- Do not import `CommonModule`; import only the directives and pipes the template uses.
- Small, single-responsibility components. Inline templates for small ones; external templates and styles use paths relative to the component file.
- `NgOptimizedImage` for static images (not for inline base64).

## State and services
- Signals for local state. Update with `set` / `update`, never `mutate`. Keep transformations pure.
- Services have one responsibility, are `providedIn: 'root'` singletons, and use `inject()` instead of constructor injection. Prefer the `@Service` decorator on v22+.
- Lazy-load feature routes.

## Templates
- Native control flow (`@if`, `@for`, `@switch`), never `*ngIf` / `*ngFor` / `*ngSwitch`.
- Keep templates simple; move logic into `computed()` values.
- Async pipe for observables. Do not assume globals such as `new Date()` are available in templates.

## Forms
- Prefer Signal Forms (`@angular/forms/signals`) on versions where they are stable (v22+).
- Otherwise typed Reactive Forms, not template-driven.

## Deeper guidance
Use the official `angular-developer` skill and the `angular-patterns` skill when available; look up current docs (Context7 or the Angular CLI MCP) before using an API you are unsure of.
