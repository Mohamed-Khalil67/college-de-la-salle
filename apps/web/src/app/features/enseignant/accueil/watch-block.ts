import { Component, computed, inject, resource } from '@angular/core';
import { addDays, type OccurrenceDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { teacherAssignments } from '../../../shared/data/teacher-data';
import { blockState, type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { subjectName } from '../../../shared/utils/format';
import { shortDate } from '../../timetable/timetable-format';
import {
  ABSENCE_DAYS,
  absenceLine,
  type AbsenceAlert,
  repeatedAbsences,
  rollSessions,
  TESTS_DAYS,
  upcomingTests,
  watchView,
} from './home-views';

interface WatchSource {
  readonly absences: readonly AbsenceAlert[];
  readonly tests: readonly OccurrenceDto[];
}

/**
 * « À surveiller »: students absent at least twice from the teacher's last roll calls, and the exams and
 * tests planned for the teacher's classes in the next two weeks (including those set by the school).
 */
@Component({
  selector: 'app-watch-block',
  imports: [HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="À surveiller"
      headingId="bloc-surveiller"
      [state]="s"
      link="classes"
      linkLabel="Mes classes"
      loadingLabel="Chargement des points à surveiller…"
      emptyText="Rien à signaler : pas d’absences répétées ni de contrôle prévu d’ici deux semaines."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        @if (s.data.absences.length) {
          <div class="watch">
            <h3 class="watch__title" id="bloc-surveiller-absences">Absences répétées</h3>
            <ul class="list" role="list" aria-labelledby="bloc-surveiller-absences">
              @for (alert of s.data.absences; track alert.studentId) {
                <li>
                  <div class="list__main">
                    <p>{{ alert.name }}</p>
                    <p class="list__meta">{{ absence(alert) }}</p>
                  </div>
                </li>
              }
            </ul>
          </div>
        }
        @if (s.data.tests.length) {
          <div class="watch">
            <h3 class="watch__title" id="bloc-surveiller-controles">Contrôles prévus</h3>
            <ul class="list" role="list" aria-labelledby="bloc-surveiller-controles">
              @for (test of s.data.tests; track test.key) {
                <li>
                  <div class="list__main">
                    <p>{{ test.event.title }}</p>
                    <p class="list__meta">{{ testMeta(test) }}</p>
                  </div>
                  <p class="watch__day">{{ day(test) }}</p>
                </li>
              }
            </ul>
          </div>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .watch {
      display: grid;
      gap: var(--space-2);
    }
    .watch p {
      margin: 0;
    }
    .watch__title {
      margin: 0;
      font-size: var(--text-label-m);
      font-weight: 600;
      color: var(--color-heading);
    }
    .watch__day {
      flex: none;
      font-size: var(--text-body-s);
      font-weight: 600;
      color: var(--color-heading);
      white-space: nowrap;
    }
  `,
})
export class WatchBlock {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #today = inject(SchoolClock).today;
  readonly #assignments = teacherAssignments();
  readonly #labels = computed(
    () => new Map((this.#assignments.hasValue() ? this.#assignments.value() : []).map((a) => [a.classId, a.classLabel])),
  );

  readonly #watch = resource({
    params: () => {
      const teacherId = this.#auth.user()?.teacherId;
      if (!teacherId || !this.#assignments.hasValue()) return undefined;
      return { teacherId, today: this.#today(), classIds: this.#assignments.value().map((a) => a.classId) };
    },
    loader: async ({ params }): Promise<WatchSource> => {
      const classIds = new Set(params.classIds);
      const occurrences = await this.#api.calendar.occurrences({
        from: addDays(params.today, -ABSENCE_DAYS),
        to: addDays(params.today, TESTS_DAYS),
      });
      const sheets = await Promise.all(
        rollSessions(occurrences, classIds, params.teacherId, params.today).map((o) =>
          this.#api.attendance.sheet(o.event.id, o.day),
        ),
      );
      return { absences: repeatedAbsences(sheets), tests: upcomingTests(occurrences, classIds, params.today) };
    },
  });

  protected readonly state = computed(() => {
    const error = this.#assignments.error();
    const source: Snapshot<WatchSource> = error ? { error, value: undefined } : snapshotOf(this.#watch);
    return blockState(source, (found) => watchView(found.absences, found.tests));
  });

  protected reload(): void {
    this.#assignments.reload();
    this.#watch.reload();
  }

  protected absence(alert: AbsenceAlert): string {
    return absenceLine(alert);
  }
  protected testMeta(test: OccurrenceDto): string {
    return [this.#labels().get(test.event.classId ?? ''), subjectName(test.event.subjectId), test.event.type.label]
      .filter(Boolean)
      .join(', ');
  }
  protected day(test: OccurrenceDto): string {
    return shortDate(test.day);
  }
}
