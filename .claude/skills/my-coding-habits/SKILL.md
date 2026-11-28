---
name: my-coding-habits
description: The owner's personal Angular and TypeScript coding habits and house rules - standalone components, signals, native control flow, inject(), signal forms, accessibility minimums and what never to use. Use whenever writing or reviewing Angular code so the result matches how this developer codes. A project's own AGENTS.md or CLAUDE.md overrides it.
---

# My coding habits

These are defaults, not laws. Order of authority: the project's `AGENTS.md` / `CLAUDE.md` (and nested `AGENTS.md` files), then the lessons in the agent's memory, then these conventions. Only use an API if the project's Angular version supports it; if a habit needs a newer version, say so and use the closest older equivalent.

The rules are not repeated here, so there is one copy to maintain. Read only the file that matches the task, from the project's `docs/agents/` folder, which the AI Skills installer writes next to this skill.

- Angular components, services, templates, forms: `angular.md`
- TypeScript: `typescript.md` (pair with the `typescript-safety` skill for the typecheck gate)
- Accessibility (part of done): `accessibility.md`
- Finishing a task, commits, PRs: `delivery.md`

Non-negotiable even without the docs: never commit or push unless explicitly asked.
