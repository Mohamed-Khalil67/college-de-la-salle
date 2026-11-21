import { SESSION_MARKER_COOKIE } from '@cdls/shared';

/**
 * Does the browser hold the API's « a session may exist » marker (`cdls_session=1`)? The API sets it with the
 * httpOnly refresh cookie and clears it on logout and on a refused refresh, so without it a page load does not
 * ask POST /api/auth/refresh (no 401 in the console and no request against the school's shared limit).
 */
export function hasSessionMarker(cookieHeader: string): boolean {
  return cookieHeader
    .split(';')
    .some((part) => {
      const [name, ...value] = part.trim().split('=');
      return name === SESSION_MARKER_COOKIE && value.join('=') !== '';
    });
}
