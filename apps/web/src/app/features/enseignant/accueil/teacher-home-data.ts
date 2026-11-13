import { computed, inject, Injectable, resource } from '@angular/core';
import type { TeacherSummaryDto, TeacherSummarySection } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { sectionSnapshot } from './home-views';

/**
 * What the blocks of the teacher's home read, fetched ONCE for the page (provided by the page component, so
 * each visit starts afresh): GET /teacher/summary holds today's lessons, the notes to finish, the homework
 * given, the tests planned and the repeated absences. The school shares one address, so the page costs one
 * request here (plus the announcements). A section the API could not read is named in `failed`: only the
 * blocks that use it show an error, and « Réessayer » reads the summary again.
 */
@Injectable()
export class TeacherHomeData {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #today = inject(SchoolClock).today;

  /** Read again when the school day changes (a page left open past midnight). */
  readonly summary = resource({
    params: () => {
      const teacherId = this.#auth.user()?.teacherId;
      return teacherId ? { teacherId, today: this.#today() } : undefined;
    },
    loader: () => this.#api.teacher.summary(),
  });

  /** Class labels by id, for the second line of a block; empty until the summary is there. */
  readonly classLabels = computed(
    () => new Map((this.summary.hasValue() ? this.summary.value().classes : []).map((c) => [c.classId, c.classLabel])),
  );

  /** What a block reads: an error if the call or one of its sections failed, else its part of the summary. */
  section<T>(sections: readonly TeacherSummarySection[], pick: (summary: TeacherSummaryDto) => T): Snapshot<T> {
    return sectionSnapshot(snapshotOf(this.summary), sections, pick);
  }

  /** Reads the summary again when it is not already loading (two clicks on « Réessayer » fetch once). */
  reload(): void {
    if (!this.summary.isLoading()) this.summary.reload();
  }
}
