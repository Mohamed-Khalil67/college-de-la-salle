import { afterNextRender, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { schoolTimeNow, schoolToday } from '../school/school-profile';

/** How often the clock looks at the time (the display moves by the minute; a midnight is caught within it). */
export const CLOCK_TICK_MS = 30_000;

/**
 * The school's clock (Cairo time) as signals: `today` (`YYYY-MM-DD`) and `now` (`HH:MM`). Role pages read it
 * instead of keeping their own timer, so a page left open follows the clock, even past midnight. The timer
 * starts in the browser only (after the first render) and stops with the app; a signal that keeps its value
 * notifies nobody, so a tick that changes nothing costs nothing. The role spaces are client-rendered; do not
 * read it from a prerendered page.
 */
@Injectable({ providedIn: 'root' })
export class SchoolClock {
  readonly #today = signal(schoolToday());
  readonly #now = signal(schoolTimeNow());
  readonly today = this.#today.asReadonly();
  readonly now = this.#now.asReadonly();

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const timer = setInterval(() => {
        this.#today.set(schoolToday());
        this.#now.set(schoolTimeNow());
      }, CLOCK_TICK_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }
}
