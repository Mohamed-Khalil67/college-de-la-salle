import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { ContactService } from './contact.service.js';
import { RETENTION_INTERVAL_MS, retentionCutoff } from './retention.js';

/**
 * Deletes handled contact messages older than CONTACT_RETENTION_DAYS: once shortly after start-up, then
 * every day. A plain timer is enough for one API process; a run that fails is logged and retried the
 * next day.
 */
@Injectable()
export class ContactRetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ContactRetentionService.name);
  #startup?: NodeJS.Timeout;
  #daily?: NodeJS.Timeout;

  constructor(
    private readonly contact: ContactService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    // Not awaited: start-up never waits on (or fails because of) the clean-up.
    this.#startup = setTimeout(() => void this.run(), 60_000).unref();
    this.#daily = setInterval(() => void this.run(), RETENTION_INTERVAL_MS).unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.#startup);
    clearInterval(this.#daily);
  }

  /** One clean-up run; returns how many messages were deleted (0 when it failed). */
  async run(now = new Date()): Promise<number> {
    const days = this.config.get('CONTACT_RETENTION_DAYS', { infer: true });
    try {
      const count = await this.contact.purgeHandledBefore(retentionCutoff(now, days));
      if (count)
        this.logger.log(`Deleted ${count} contact message(s) handled over ${days} days ago.`);
      return count;
    } catch (error) {
      this.logger.error(
        'Contact message retention failed',
        error instanceof Error ? error.stack : error,
      );
      return 0;
    }
  }
}
