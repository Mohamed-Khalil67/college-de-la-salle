import { computed, inject, Injectable, resource } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { SchoolClock } from '../../core/clock/school-clock';
import { currentTerm, currentYear } from '../utils/format';

/**
 * The school years and the term of today, loaded once for the whole app (GET /school-years fires once, not
 * once per block). `settled` is false while the first answer is awaited: blocks that look at a term wait for
 * it, then fall back to the whole year if the years could not be read (`years.error()`). `reload()` retries.
 */
@Injectable({ providedIn: 'root' })
export class SchoolYears {
  readonly #api = inject(ApiClient);
  readonly #clock = inject(SchoolClock);

  readonly years = resource({ loader: () => this.#api.school.years() });
  readonly settled = computed(() => !this.years.isLoading());
  readonly year = computed(() => (this.years.hasValue() ? currentYear(this.years.value()) : null));
  /** The term of today in the current school year; null when unknown (the blocks then look at the whole year). */
  readonly term = computed(() => (this.years.hasValue() ? currentTerm(this.years.value(), this.#clock.today()) : null));

  reload(): void {
    this.years.reload();
  }
}
