import { JwtService } from '@nestjs/jwt';
import type { AccessTokenSubject } from './client-key.js';

/**
 * The account id of an access token whose signature and issuer check out (an expired one still names its
 * account: the authentication guard refuses it right after). Used only to build rate-limit keys.
 */
export function accessTokenSubjectOf(secret: string): AccessTokenSubject {
  const jwt = new JwtService({
    secret,
    verifyOptions: { algorithms: ['HS256'], issuer: 'cdls-api', ignoreExpiration: true },
  });
  return (token) => {
    try {
      const { sub } = jwt.verify<{ sub?: unknown }>(token);
      return typeof sub === 'string' ? sub : null;
    } catch {
      return null;
    }
  };
}

let cached: { secret: string; subjectOf: AccessTokenSubject } | undefined;

/**
 * Same check for `@Throttle()` decorators, which run where nothing is injected: the secret is read from the
 * environment (validated at start-up by `validateEnv`), like `throttleLimit` does for the limits.
 */
export const envAccessTokenSubject: AccessTokenSubject = (token) => {
  const secret = process.env['JWT_ACCESS_SECRET'] ?? '';
  if (!secret) return null;
  if (cached?.secret !== secret) cached = { secret, subjectOf: accessTokenSubjectOf(secret) };
  return cached.subjectOf(token);
};
