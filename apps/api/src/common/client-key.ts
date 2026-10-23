import { isIPv6 } from 'node:net';

/**
 * The rate-limit key of a client address. IPv4 addresses count one by one; an IPv6 address counts by
 * its /64 prefix, since one machine usually holds a whole /64 and could otherwise rotate through it to
 * escape the limits. IPv4-mapped IPv6 addresses (`::ffff:1.2.3.4`) count as their IPv4 address.
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!isIPv6(ip)) return ip;
  return `${expandIPv6(ip).slice(0, 4).join(':')}::/64`;
}

/** The eight 16-bit groups of an IPv6 address, without leading zeros. */
function expandIPv6(ip: string): string[] {
  const [head = '', tail] = ip.toLowerCase().split('%')[0]!.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((group) => group.replace(/^0+(?=.)/, ''));
}

type RequestLike = Record<string, unknown>;

/**
 * Sign-in limit key: client address plus the e-mail tried. A class signing in for the first time behind
 * the school's one address no longer shares a single counter, while guessing one account stays limited.
 */
export function loginTracker(req: RequestLike): string {
  const body = req['body'] as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  return `${clientKey(req['ip'] as string | undefined)}|${email}`;
}

/**
 * « Mot de passe oublié » limit key: client address plus the identifier asked for, like the sign-in, so
 * one account cannot be flooded with mails from one place while a shared school address stays usable.
 */
export function forgotPasswordTracker(req: RequestLike): string {
  const body = req['body'] as { identifier?: unknown } | undefined;
  const identifier =
    typeof body?.identifier === 'string' ? body.identifier.trim().toLowerCase().slice(0, 254) : '';
  return `${clientKey(req['ip'] as string | undefined)}|${identifier}`;
}

/**
 * Password-change limit key: client address plus the account named by the access token. The token is only
 * read for this key (the authentication guard checks it right after), so a forged one gains nothing.
 */
export function passwordTracker(req: RequestLike): string {
  const header = (req['headers'] as Record<string, unknown> | undefined)?.['authorization'];
  let sub = '';
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    try {
      const payload = header.split('.')[1] ?? '';
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown };
      if (typeof parsed.sub === 'string') sub = parsed.sub.slice(0, 64);
    } catch {
      // Not a token: counted by address alone.
    }
  }
  return `${clientKey(req['ip'] as string | undefined)}|${sub}`;
}
