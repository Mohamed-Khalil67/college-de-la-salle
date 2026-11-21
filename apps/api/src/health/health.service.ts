import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { migrationFromDisk, readVersion } from './build-info.js';
import type { HealthDto, LiveHealthDto } from './health.dto.js';
import { assertSessionTimeZone } from '../prisma/pool-config.js';

@Injectable()
export class HealthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HealthService.name);
  /** From apps/api/package.json; the same relative path works from src/ and from dist/. */
  private readonly version = readVersion(new URL('../../package.json', import.meta.url));
  private migration: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads the last applied migration ONCE, at start (the liveness route never touches the database).
   * If the database cannot be asked, the newest migration folder of the install stands in: the image applies
   * its migrations before it starts.
   */
  async onApplicationBootstrap(): Promise<void> {
    // Its own query: a missing `_prisma_migrations` must not skip it. Outside a try only for the check itself: a
    // database that answers in another zone would store shifted instants, so the API stops.
    let zone: string | null = null;
    try {
      const [row] = await this.prisma.$queryRaw<{ zone: string }[]>`SELECT current_setting('TimeZone') AS zone`;
      zone = row?.zone ?? null;
    } catch {
      zone = null; // unreachable: the API still boots, /api/health/db says so
    }
    assertSessionTimeZone(zone);
    try {
      const rows = await this.prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         ORDER BY migration_name DESC LIMIT 1`;
      this.migration = rows[0]?.migration_name ?? null;
    } catch {
      this.migration = null;
    }
    this.migration ??= migrationFromDisk(new URL('../../prisma/migrations/', import.meta.url));
  }

  /** Cached answer of the liveness route: no I/O. */
  live(): LiveHealthDto {
    return { status: 'ok', version: this.version, migration: this.migration };
  }

  async checkDatabase(): Promise<HealthDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error) {
      this.logger.warn(
        `Database check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException('Database unreachable');
    }
  }
}
