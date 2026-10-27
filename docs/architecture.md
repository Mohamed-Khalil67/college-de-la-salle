# CDLS: architecture

The diagrams (system, web app layers, database groups, school year, roles) are in
[`architecture-map.html`](architecture-map.html). Open it in a browser. The database tab there is a summary; the
source of truth for tables is `apps/api/prisma/schema.prisma`.

## Where things live

| What | Where |
|---|---|
| REST contract and pure logic | `packages/shared/src/` |
| API modules, guards, services | `apps/api/src/` (one folder per feature), conventions in `apps/api/CLAUDE.md` |
| Schema and migrations | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/` |
| Web app and design system | `apps/web/src/app/`, conventions in `apps/web/CLAUDE.md`, tokens in `apps/web/src/styles/` |
| Deployment | `deploy/`, `docs/deployment.md` |
| Design decisions and leftovers | `docs/school-year-design.md` |
