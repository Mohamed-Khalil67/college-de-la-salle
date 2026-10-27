import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StudentAttendanceDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { Badge } from '../../../shared/ui';
import { ATTENDANCE_LABELS, ATTENDANCE_TONES, dayTitle, subjectName, timeSpan } from '../../../shared/utils/format';
import { LoadState } from '../../../shared/components/load-state';

/** The latest absences and late arrivals. */
@Component({
  selector: 'app-absences-panel',
  imports: [RouterLink, Badge, LoadState],
  host: { class: 'panel' },
  template: `
    <section class="card card--panel" aria-labelledby="abs-title">
      <div class="card__header">
        <h2 id="abs-title" class="t-h3">Absences</h2>
        <a class="t-body-s" routerLink="absences">Détail</a>
      </div>
      <app-load-state [ref]="records" label="Chargement des absences…" />
      @if (records.hasValue()) {
        @if (latest().length) {
          <ul class="list" role="list">
            @for (r of latest(); track r.record.id) {
              <li>
                <div class="list__main">
                  <p>{{ day(r) }}</p>
                  <p class="list__meta">{{ meta(r) }}</p>
                </div>
                <cdls-badge [tone]="tone(r)">{{ status(r) }}</cdls-badge>
              </li>
            }
          </ul>
        } @else {
          <p class="t-muted">Aucune absence cette année.</p>
        }
      }
    </section>
  `,
})
export class AbsencesPanel {
  readonly studentId = input.required<string>();

  readonly #api = inject(ApiClient);
  protected readonly records = resource({
    params: () => this.studentId(),
    loader: ({ params }) => this.#api.attendance.ofStudent(params),
  });
  protected readonly latest = computed(() => (this.records.hasValue() ? this.records.value().slice(0, 3) : []));

  protected day(r: StudentAttendanceDto): string {
    return dayTitle(r.record.date);
  }
  protected meta(r: StudentAttendanceDto): string {
    const course = subjectName(r.event.subjectId) || r.event.title;
    return [course, timeSpan(r.event.startTime, r.event.endTime), r.record.note].filter(Boolean).join(', ');
  }
  protected status(r: StudentAttendanceDto): string {
    return ATTENDANCE_LABELS[r.record.status];
  }
  protected tone(r: StudentAttendanceDto) {
    return ATTENDANCE_TONES[r.record.status];
  }
}
