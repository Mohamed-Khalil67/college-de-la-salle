import { computed, inject, Injectable, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { teacherAssignments } from '../../../shared/data/teacher-data';
import { classSubjectChoices } from '../noter/noter-logic';
import type { PendingEntry } from './home-views';

/**
 * What several blocks of the teacher's home read, fetched ONCE for the page (it is provided by the page
 * component, so each visit starts afresh): the teacher's assignments and, for each class and subject taught,
 * the notes still to finish. The school shares one address, so every request a block does not make counts:
 * the blocks share these instead of asking again.
 */
@Injectable()
export class TeacherHomeData {
  readonly #api = inject(ApiClient);
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

  /** Class labels by id, for the second line of a block; empty until the assignments are known. */
  readonly classLabels = computed(
    () => new Map((this.assignments.hasValue() ? this.assignments.value() : []).map((a) => [a.classId, a.classLabel])),
  );

  reload(): void {
    this.assignments.reload();
    this.pending.reload();
  }
}
