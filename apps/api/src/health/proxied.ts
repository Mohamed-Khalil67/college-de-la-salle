import type { IncomingHttpHeaders } from 'node:http';

/** Headers a reverse proxy adds (the web container's nginx sets the first two on every /api/ request). */
const PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded'] as const;

/** Did the request reach the API through a reverse proxy, that is, from outside the stack? */
export function cameThroughProxy(headers: IncomingHttpHeaders): boolean {
  return PROXY_HEADERS.some((name) => headers[name] !== undefined);
}
