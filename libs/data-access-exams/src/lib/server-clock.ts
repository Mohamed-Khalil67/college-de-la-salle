import { DestroyRef, Service, type Signal, inject, signal } from '@angular/core';
import type { EpochMillis } from '@exam/contracts';

/**
 * NTP-style offset estimate: assume the server stamped `serverNow` at the midpoint of the round
 * trip. Error is bounded by RTT/2, which is negligible next to a minutes-long exam timer.
 */
export function estimateClockOffset(
  serverNow: EpochMillis,
  sentAt: EpochMillis,
  receivedAt: EpochMillis,
): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/**
 * Process-wide view of the server's clock. The countdown is always `expiresAt - serverClock.now()`,
 * never a decrementing counter, so throttled background tabs, sleep/resume and a skewed local
 * clock cannot drift it. (The server still enforces the deadline independently in the rules.)
 */
@Service()
export class ServerClock {
  readonly #offsetMs = signal(0);
  readonly offsetMs = this.#offsetMs.asReadonly();

  now(): EpochMillis {
    return Date.now() + this.#offsetMs();
  }

  calibrate(serverNow: EpochMillis, sentAt: EpochMillis, receivedAt: EpochMillis): void {
    this.#offsetMs.set(estimateClockOffset(serverNow, sentAt, receivedAt));
  }
}

/** A signal of server time that re-emits every `intervalMs`. Must run in an injection context. */
export function injectServerNow(intervalMs = 1_000): Signal<EpochMillis> {
  const clock = inject(ServerClock);
  const now = signal(clock.now());
  const handle = setInterval(() => now.set(clock.now()), intervalMs);
  inject(DestroyRef).onDestroy(() => clearInterval(handle));
  return now.asReadonly();
}
