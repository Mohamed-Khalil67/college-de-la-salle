import { Component, computed, inject, resource } from '@angular/core';
import type { StudentAttendanceDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { HomeBlock } from '../../../shared/components/home-block';
import { SchoolYears } from '../../../shared/data/school-years';
import { Badge } from '../../../shared/ui';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { ATTENDANCE_LABELS, ATTENDANCE_TONES, dayTitle, subjectName, timeSpan } from '../../../shared/utils/format';
import { absencesView } from './home-views';

/** « Absences »: the count of the current term and the latest absence or late arrival. */
@Component({
  selector: 'app-absences-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Absences"
      headingId="bloc-absences"
      [state]="s"
      link="absences"
      linkLabel="Détail des absences"
      loadingLabel="Chargement des absences…"
      [emptyText]="emptyText()"
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <div class="absences__counts">
          <p class="stat">
            <span class="stat__value tabular">{{ s.data.absences }}</span>
            <span class="stat__label">{{ s.data.absences > 1 ? 'absences' : 'absence' }} {{ termPhrase() }}</span>
          </p>
          <p class="stat">
            <span class="stat__value tabular">{{ s.data.late }}</span>
            <span class="stat__label">{{ s.data.late > 1 ? 'retards' : 'retard' }}</span>
          </p>
        </div>
        @let latest = s.data.latest;
        <div class="absences__latest">
          <h3 class="absences__title">La plus récente</h3>
          <div class="absences__row">
            <div class="list__main">
              <p>{{ day(latest) }}</p>
              <p class="list__meta">{{ meta(latest) }}</p>
            </div>
            <cdls-badge [tone]="tone(latest)">{{ status(latest) }}</cdls-badge>
          </div>
        </div>
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .absences__counts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-8);
    }
    .absences__counts p {
      margin: 0;
    }
    .absences__latest {
      display: grid;
      gap: var(--space-2);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-line);
    }
    .absences__title {
      margin: 0;
      font-size: var(--text-label-m);
      font-weight: 600;
      color: var(--color-heading);
    }
    .absences__row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-4);
    }
    .absences__row p {
      margin: 0;
    }
  `,
})
export class AbsencesBlock {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #years = inject(SchoolYears);
  readonly #term = this.#years.term;

  readonly #records = resource({
    params: () => {
      const studentId = this.#auth.user()?.studentId;
      // Without the terms (still loading), wait; if they failed, fall back to the whole year.
      if (!studentId || !this.#years.settled()) return undefined;
      const term = this.#term();
      return { studentId, from: term?.startsOn, to: term?.endsOn };
    },
    loader: ({ params }) => this.#api.attendance.ofStudent(params.studentId, { from: params.from, to: params.to }),
  });

  protected readonly state = computed(() => blockState(snapshotOf(this.#records), absencesView));

  protected reload(): void {
    if (this.#years.years.error()) this.#years.reload();
    this.#records.reload();
  }

  protected readonly termPhrase = computed(() => {
    const term = this.#term();
    return term ? `au ${term.label}` : 'cette année';
  });
  protected readonly emptyText = computed(() => `Aucune absence ni aucun retard ${this.termPhrase()}. Continuez ainsi.`);

  protected day(r: StudentAttendanceDto): string {
    return dayTitle(r.record.date);
  }
  protected meta(r: StudentAttendanceDto): string {
    const course = subjectName(r.event.subjectId) || r.event.title;
    const late = r.record.status === 'late' && r.record.minutesLate ? `${r.record.minutesLate} min de retard` : '';
    return [course, timeSpan(r.event.startTime, r.event.endTime), late].filter(Boolean).join(', ');
  }
  protected status(r: StudentAttendanceDto): string {
    return ATTENDANCE_LABELS[r.record.status];
  }
  protected tone(r: StudentAttendanceDto) {
    return ATTENDANCE_TONES[r.record.status];
  }
}
