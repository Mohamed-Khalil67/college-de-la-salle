import { clientKey, cookieTracker, hasCookie, trafficTracker } from './client-key.js';

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

describe('trafficTracker', () => {
  /** Accepts only the tokens `signed-<id>`, like a signature check would. */
  const tracker = trafficTracker((token) => (token.startsWith('signed-') ? token.slice(7) : null));
  const request = (authorization?: string) => ({
    ip: '203.0.113.7',
    headers: authorization === undefined ? {} : { authorization },
  });

  it('counts a request with a signed access token against its account, not the shared address', () => {
    expect(tracker(request('Bearer signed-u1'))).toBe('account:u1');
    expect(tracker(request('Bearer signed-u2'))).toBe('account:u2');
  });

  it('counts a request without a token, or with one that does not verify, against its address', () => {
    expect(tracker(request())).toBe('203.0.113.7');
    expect(tracker(request('Bearer forged-u1'))).toBe('203.0.113.7');
    expect(tracker(request('Basic signed-u1'))).toBe('203.0.113.7');
  });
});

describe('cookieTracker', () => {
  const tracker = cookieTracker('cdls_refresh');

  it('counts per cookie value, by a hash that never contains the value', () => {
    const one = tracker({ ip: '203.0.113.7', cookies: { cdls_refresh: 'id-1.secret-1' } });
    const two = tracker({ ip: '203.0.113.7', cookies: { cdls_refresh: 'id-2.secret-2' } });
    expect(one).toMatch(/^cdls_refresh:[\w-]{43}$/);
    expect(one).not.toContain('secret-1');
    expect(two).not.toBe(one);
    expect(tracker({ ip: '198.51.100.1', cookies: { cdls_refresh: 'id-1.secret-1' } })).toBe(one);
  });

  it('falls back to the address without the cookie', () => {
    expect(tracker({ ip: '203.0.113.7' })).toBe('cdls_refresh:none|203.0.113.7');
    expect(tracker({ ip: '203.0.113.7', cookies: { cdls_refresh: '' } })).toBe(
      'cdls_refresh:none|203.0.113.7',
    );
  });

  it('hasCookie says whether the cookie is there', () => {
    expect(hasCookie({ cookies: { cdls_refresh: 'x' } }, 'cdls_refresh')).toBe(true);
    expect(hasCookie({ cookies: {} }, 'cdls_refresh')).toBe(false);
    expect(hasCookie({}, 'cdls_refresh')).toBe(false);
  });
});
