<!-- ai-skills: managed file. Re-running the installer updates it; put project-specific rules in your own docs. -->
# TypeScript conventions

- Strict typing. Prefer inference when the type is obvious.
- No `any`; use `unknown` and narrow it.
- Validate API data at the boundary.
- Run the project's typecheck before finishing (see [delivery.md](delivery.md)).
- For compiler settings and the typecheck gate, use the `typescript-safety` skill when available.
