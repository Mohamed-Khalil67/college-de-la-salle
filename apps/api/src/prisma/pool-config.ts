import type { PrismaPg } from '@prisma/adapter-pg';

/** What `new PrismaPg(...)` takes as its pool configuration (pg's `PoolConfig`). */
export type PoolConfig = Exclude<ConstructorParameters<typeof PrismaPg>[0], string | { query: unknown }>;

/**
 * The session time zone of every connection. Prisma writes and reads `timestamptz` through the session's
 * zone: on a server whose `TimeZone` is not UTC (a dev cluster that inherited Africa/Cairo, or a database
 * someone gave `ALTER DATABASE … SET timezone`) stored instants were 2 h off and SQL comparing with `now()`
 * (an expired temporary password) went wrong. Forced here, so no environment can change it.
 */
export const SESSION_TIME_ZONE = 'UTC';

/**
 * The boot check: the zone a connection reported (`current_setting('TimeZone')`) must be UTC. `null` means the
 * database could not be asked (the API still boots; /api/health/db says so).
 */
export function assertSessionTimeZone(zone: string | null): void {
  if (zone !== null && zone !== SESSION_TIME_ZONE && zone !== 'Etc/UTC')
    throw new Error(
      `The database session runs in time zone ${zone}, not ${SESSION_TIME_ZONE}: stored instants would be shifted. ` +
        'Remove options= or PGTZ from the connection settings.',
    );
}

export const POOL_DEFAULTS = { max: 10, connectionTimeoutMillis: 5_000 } as const;

export interface PoolOptions {
  /** Connections kept by this process at most (`DB_POOL_MAX`). */
  readonly max?: number;
  /** How long a query waits for a free connection or a new one before failing (`DB_CONNECT_TIMEOUT_MS`). */
  readonly connectionTimeoutMillis?: number;
}

/**
 * The pg pool settings of the API, the seed and the CLI: an explicit size, a bounded wait (pg's default waits
 * forever when every connection is busy or the database hangs) and the UTC session zone. A `options=`
 * parameter in the URL would take precedence over this one (pg lets the connection string win), so the
 * URL is refused when it carries one.
 */
export function poolConfig(connectionString: string, options: PoolOptions = {}): PoolConfig {
  if (/[?&]options=/i.test(connectionString))
    throw new Error('DATABASE_URL must not carry options=: the API sets the session time zone itself.');
  return {
    connectionString,
    max: options.max ?? POOL_DEFAULTS.max,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? POOL_DEFAULTS.connectionTimeoutMillis,
    options: `-c TimeZone=${SESSION_TIME_ZONE}`,
  };
}
