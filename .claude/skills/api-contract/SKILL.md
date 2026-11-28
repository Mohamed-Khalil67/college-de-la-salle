---
name: api-contract
description: Designs and reviews the HTTP contract of a NestJS API - resource naming, request and response DTOs, one error format (RFC 9457 problem details), pagination, idempotency, versioning and OpenAPI docs. Use when adding or changing an endpoint, designing a new API, returning entities from controllers, inconsistent error bodies, or the user says design the API, add pagination, add Swagger, or version the API.
---

# API contract

The contract is what clients depend on. Change it deliberately, document it, and keep it the same shape everywhere.

## Resources and methods
- Plural nouns, kebab-case: `GET /course-applications/:id`. Actions that are not CRUD become sub-resources (`POST /applications/:id/submit`), not verbs in the path.
- `POST` creates (201 + `Location` header), `PUT` replaces, `PATCH` partially updates, `DELETE` returns 204. Return 404 for a missing resource and 403 only when the caller may know it exists.

## DTOs in and out, never entities
- A request DTO per operation (`CreateCourseDto`, `UpdateCourseDto` via `PartialType`), validated by the global `ValidationPipe`.
- A response DTO per resource. Map the entity to it in the service or a mapper. Returning an ORM entity leaks columns (password hashes, internal flags) and couples clients to the schema.
- IDs as strings in JSON (UUIDs, or bigint ids serialized as strings). Dates as ISO 8601 UTC strings.

## One error format
- A global exception filter (`APP_FILTER`) turns every error into RFC 9457 problem details, `Content-Type: application/problem+json`:
  `{ "type": "https://errors.example.com/validation", "title": "Validation failed", "status": 400, "detail": "...", "instance": "/courses", "errors": [{ "field": "name", "message": "..." }] }`
- Unknown errors become 500 with a generic title; log the real error with the request id, never return the stack or the SQL.

## Lists
- Cursor pagination for anything that grows: `?limit=20&cursor=<opaque>` returning `{ items, nextCursor }`. Offset pagination only for small, admin-style tables.
- Cap `limit` (for example 100) in the DTO. Whitelist sort and filter fields; never pass them straight into a query.

## Safe retries
- Accept an `Idempotency-Key` header on POSTs that create money movements, orders or messages. Store key + response for a window (24 h) and replay the stored response on a repeat.

## Versioning
- `app.enableVersioning({ type: VersioningType.URI })` and `@Version('2')` on the changed controller or route. Additive changes (new optional field, new endpoint) do not need a new version; removing or renaming does.

## OpenAPI
- Use `@nestjs/swagger` with its CLI plugin (`"compilerOptions": { "plugins": ["@nestjs/swagger"] }` in `nest-cli.json`) so DTO properties are documented without decorating each one. Add `@ApiResponse` for error statuses. Serve the document only outside production, or behind auth.

## Done when
- The endpoint is in the OpenAPI document with its request, response and error shapes.
- An invalid request and an unknown error both return problem details.
- No controller returns an entity class.
