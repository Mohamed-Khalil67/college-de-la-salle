import { clientKey } from './client-key.js';

describe('clientKey', () => {
  it('keeps IPv4 addresses, including IPv4-mapped IPv6 ones', () => {
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('groups an IPv6 address by its /64 prefix', () => {
    expect(clientKey('2001:db8:aa:1::1')).toBe('2001:db8:aa:1::/64');
    expect(clientKey('2001:0db8:00aa:0001:ffff:1:2:3')).toBe('2001:db8:aa:1::/64');
    expect(clientKey('2001:db8::5')).toBe('2001:db8:0:0::/64');
    expect(clientKey('::1')).toBe('0:0:0:0::/64');
  });

  it('has a key for a request without an address', () => {
    expect(clientKey(undefined)).toBe('unknown');
  });
});
