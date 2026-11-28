---
name: auth-jwt
description: Implements and reviews authentication and authorization in NestJS - JWT access tokens, rotating refresh tokens, a global auth guard with a @Public() decorator, role checks, password hashing, cookies and login rate limits. Use when adding login, sign-up, refresh tokens, protecting routes, roles or permissions, or when the user says add auth, JWT, guards, or users can access each other's data.
---

# Authentication and authorization (NestJS)

For an audit of existing auth code, also run `security-review`.

## Secure by default
- One global guard: `{ provide: APP_GUARD, useExisting: JwtAuthGuard }` with `JwtAuthGuard` in `providers` (so tests can override it). Every route needs a token unless marked `@Public()`.
- `@Public()` is `SetMetadata(IS_PUBLIC_KEY, true)`; the guard reads it with `reflector.getAllAndOverride(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])` and returns `true` before checking the token.

## Tokens
- Access token: JWT, short-lived (5 to 15 minutes), signed with a strong secret or a key pair from config, with `sub`, `iat`, `exp` and only the claims you need. No personal data in it; it is readable by anyone who holds it.
- Refresh token: random (not a JWT), long-lived, stored **hashed** in the database with user id, expiry and device. Rotate on every use: issue a new one, revoke the old one; if a revoked token is presented again, revoke the whole family (token theft).
- Verify with the algorithm pinned (`algorithms: ['HS256']` or `['RS256']`); never accept `none`.

## Where tokens live (browser clients)
- Refresh token in an `HttpOnly; Secure; SameSite=Lax` (or `Strict`) cookie scoped to the refresh path. Access token in memory, sent as `Authorization: Bearer`.
- If the access token is also a cookie, add CSRF protection for state-changing requests.

## Passwords
- Hash with argon2id (`argon2` package) using its defaults or stronger; bcrypt only if the project already uses it. Never log or return a hash.
- Same error and similar timing for "unknown email" and "wrong password".
- Rate-limit login, sign-up, refresh and password reset per account and per IP (a named `@nestjs/throttler` throttler).

## Authorization
- Roles or permissions through a second guard reading `@Roles(...)` metadata with the Reflector.
- Check ownership in the service, not only the role: load the resource with `where: { id, ownerId: user.id }` (or the tenant id). A missing row and a row owned by someone else both answer 404. This is where most real breaches happen.

## Done when
- A route without `@Public()` returns 401 without a token; an expired token returns 401; another user's resource returns 404.
- Refresh rotation and reuse detection are covered by e2e tests (see `nest-testing`).
