import { Global, Injectable, Module } from '@nestjs/common';

/** How long a shutdown waits for work in progress (a mail being handed to the SMTP server…) before giving up. */
export const SHUTDOWN_WAIT_MS = 10_000;

/**
 * Work that runs outside a request (a mail send, a timer's run): started through `track`, so a shutdown can
 * wait for it. `PrismaService.onModuleDestroy` drains it BEFORE it disconnects (Nest destroys the database
 * client before any `onApplicationShutdown`, so waiting there would be too late: the work could not write
 * its result). After `drain` starts, `closing` is true and timers must not start new runs.
 */
@Injectable()
export class BackgroundWork {
  readonly #running = new Set<Promise<unknown>>();
  #closing = false;

  /** True once a shutdown began: do not start anything new. */
  get closing(): boolean {
    return this.#closing;
  }

  /** How many pieces of work are in progress. */
  get pending(): number {
    return this.#running.size;
  }

  /** Registers `work` and returns it unchanged; it leaves the set when it settles, whatever the outcome. */
  track<T>(work: Promise<T>): Promise<T> {
    this.#running.add(work);
    const done = () => void this.#running.delete(work);
    work.then(done, done);
    return work;
  }

  /**
   * Closes the door to new work and waits for what is running, at most `timeoutMs`.
   * Resolves true when everything finished, false when the wait timed out (the rest is abandoned).
   */
  async drain(timeoutMs: number = SHUTDOWN_WAIT_MS): Promise<boolean> {
    this.#closing = true;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    try {
      while (this.#running.size > 0) {
        const outcome = await Promise.race([Promise.allSettled(this.#running), timeout]);
        if (outcome === 'timeout') return false;
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  }
}

@Global()
@Module({ providers: [BackgroundWork], exports: [BackgroundWork] })
export class BackgroundWorkModule {}
