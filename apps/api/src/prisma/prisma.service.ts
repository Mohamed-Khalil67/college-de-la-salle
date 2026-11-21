import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { BackgroundWork } from '../common/background-work.js';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.validation.js';
import { poolConfig } from './pool-config.js';

/**
 * The one Prisma client of the app, injected wherever the database is needed.
 * It connects lazily on the first query, so the API boots (and /api/health answers) even when
 * PostgreSQL is down; /api/health/db reports the database state.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(
    config: ConfigService<Env, true>,
    private readonly background: BackgroundWork,
  ) {
    super({
      adapter: new PrismaPg(
        poolConfig(config.get('DATABASE_URL', { infer: true }), {
          max: config.get('DB_POOL_MAX', { infer: true }),
          connectionTimeoutMillis: config.get('DB_CONNECT_TIMEOUT_MS', { infer: true }),
        }),
      ),
    });
  }

  async onModuleDestroy(): Promise<void> {
    // Mails being sent and timer runs finish first (bounded): they write their result to this database.
    if (!(await this.background.drain()))
      new Logger(PrismaService.name).warn(
        `Shutdown: ${this.background.pending} background job(s) still running after the wait; abandoned.`,
      );
    await this.$disconnect();
  }
}
