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
