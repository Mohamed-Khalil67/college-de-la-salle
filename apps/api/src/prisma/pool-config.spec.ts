import { assertSessionTimeZone, POOL_DEFAULTS, poolConfig } from './pool-config.js';

const URL_ = 'postgresql://cdls:pw@localhost:5432/cdls?schema=public';

describe('poolConfig', () => {
  it('forces the UTC session zone and an explicit, bounded pool', () => {
    expect(poolConfig(URL_)).toEqual({
      connectionString: URL_,
      max: POOL_DEFAULTS.max,
      connectionTimeoutMillis: POOL_DEFAULTS.connectionTimeoutMillis,
      options: '-c TimeZone=UTC',
    });
    expect(poolConfig(URL_, { max: 4, connectionTimeoutMillis: 800 })).toMatchObject({
      max: 4,
      connectionTimeoutMillis: 800,
    });
  });

  it('refuses a URL with its own options=, which pg would let win over the UTC zone', () => {
    expect(() => poolConfig(`${URL_}&options=-c%20TimeZone%3DAfrica%2FCairo`)).toThrow(/options=/);
    expect(() => poolConfig('postgresql://u@h/db?OPTIONS=x')).toThrow(/options=/);
  });
});

describe('assertSessionTimeZone', () => {
  it('accepts UTC, and an unreachable database (null)', () => {
    expect(() => assertSessionTimeZone('UTC')).not.toThrow();
    expect(() => assertSessionTimeZone('Etc/UTC')).not.toThrow();
    expect(() => assertSessionTimeZone(null)).not.toThrow();
  });

  it('stops the boot on any other zone', () => {
    expect(() => assertSessionTimeZone('Africa/Cairo')).toThrow(/Africa\/Cairo/);
  });
});
