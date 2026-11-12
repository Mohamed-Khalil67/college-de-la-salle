import { computed, inject, Injectable, resource } from '@angular/core';
import { addDays } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { teacherAssignments } from '../../../shared/data/teacher-data';
import { classSubjectChoices } from '../noter/noter-logic';
import { HOMEWORK_DAYS, type PendingEntry, TESTS_DAYS } from './home-views';

/** How far ahead the shared calendar reads. */
const EVENTS_DAYS = Math.max(HOMEWORK_DAYS, TESTS_DAYS);

/**
 * What several blocks of the teacher's home read, fetched ONCE for the page (it is provided by the page
 * component, so each visit starts afresh): the teacher's assignments and, for each class and subject taught,
 * the notes still to finish, and the calendar of the next two weeks. The school shares one address, so every request a block does not make counts:
 * the blocks share these instead of asking again.
 */
@Injectable()
export class TeacherHomeData {
  readonly #api = inject(ApiClient);
  readonly #today = inject(SchoolClock).today;
  readonly assignments = teacherAssignments();

  /** One call per class and subject taught (« Noter » shows them the same way). */
  readonly pending = resource({
    params: () => (this.assignments.hasValue() ? classSubjectChoices(this.assignments.value()) : undefined),
    loader: ({ params }): Promise<PendingEntry[]> =>
      Promise.all(
        params.map(async (choice) => ({
          choice,
          pending: await this.#api.grades.pending({ classId: choice.classId, subjectId: choice.subjectId }),
        })),
      ),
  });

  /** The calendar of the next two weeks: the homework given and the tests planned both read it. */
  readonly events = resource({
    params: () => ({ today: this.#today() }),
    loader: ({ params }) => this.#api.calendar.occurrences({ from: params.today, to: addDays(params.today, EVENTS_DAYS) }),
  });

  /** Class labels by id, for the second line of a block; empty until the assignments are known. */
  readonly classLabels = computed(
    () => new Map((this.assignments.hasValue() ? this.assignments.value() : []).map((a) => [a.classId, a.classLabel])),
  );

  /**
   * Reloads what failed only (a retry must not repeat the requests that worked), and nothing already loading, so two
   * clicks on « Réessayer » fetch once. The pending notes follow their assignments.
   */
  reload(): void {
    if (this.assignments.error()) {
      if (!this.assignments.isLoading()) this.assignments.reload();
    } else if (this.pending.error() && !this.pending.isLoading()) this.pending.reload();
  }

  /** The shared calendar, when it failed and is not already loading. */
  reloadEvents(): void {
    if (this.events.error() && !this.events.isLoading()) this.events.reload();
  }
}
