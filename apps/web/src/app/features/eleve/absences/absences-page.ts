import { Component, computed, inject, resource } from '@angular/core';
import type { StudentAttendanceDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { Badge, EmptyState } from '../../../shared/ui';
import { ATTENDANCE_LABELS, ATTENDANCE_TONES, dayTitle, subjectName, timeSpan } from '../../../shared/utils/format';
import { attendanceCounts } from '../shared/grades';
import { LoadState } from '../../../shared/components/load-state';

/** The student's absences and late arrivals, newest first (present marks are not listed). */
@Component({
  selector: 'app-absences-page',
  imports: [Badge, EmptyState, LoadState],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Absences</h1>
        <p class="t-muted">Absences et retards relevés par vos enseignants pendant l’appel.</p>
      </div>
    </div>

    <app-load-state [ref]="records" label="Chargement des absences…" />
    @if (records.hasValue()) {
      @if (records.value().length) {
        <div class="avg-summary avg-summary--band">
          <div class="stat"><span class="stat__value tabular">{{ counts().absent }}</span><span class="stat__label">{{ absentLabel() }}</span></div>
          <div class="stat"><span class="stat__value tabular">{{ counts().late }}</span><span class="stat__label">{{ lateLabel() }}</span></div>
          <div class="stat"><span class="stat__value stat__value--muted tabular">{{ counts().excused }}</span><span class="stat__label">{{ excusedLabel() }}</span></div>
        </div>
        <div class="table-wrap" role="region" aria-labelledby="absences-caption" tabindex="0">
          <table class="table table--stack absences-table">
            <caption id="absences-caption">Absences et retards, du plus récent au plus ancien</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Cours</th>
                <th scope="col">Horaire</th>
                <th scope="col">Statut</th>
                <th scope="col">Remarque</th>
              </tr>
            </thead>
            <tbody>
              @for (r of records.value(); track r.record.id) {
                <tr>
                  <th scope="row">{{ day(r) }}</th>
                  <td>{{ course(r) }}</td>
                  <td data-label="Horaire">{{ time(r) }}</td>
                  <td data-label="Statut"><cdls-badge [tone]="tone(r)">{{ status(r) }}</cdls-badge></td>
                  <td data-label="Remarque">{{ r.record.note || '–' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <cdls-empty-state icon="check" title="Aucune absence" description="Vous n’avez été noté ni absent ni en retard cette année." />
      }
    }
  `,
})
export class AbsencesPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);

  protected readonly records = resource({
    params: () => this.#auth.user()?.studentId ?? undefined,
    loader: ({ params }) => this.#api.attendance.ofStudent(params),
  });

  protected readonly counts = computed(() => attendanceCounts(this.records.hasValue() ? this.records.value() : []));
  protected readonly absentLabel = computed(() => (this.counts().absent > 1 ? 'Absences' : 'Absence'));
  protected readonly lateLabel = computed(() => (this.counts().late > 1 ? 'Retards' : 'Retard'));
  protected readonly excusedLabel = computed(() => (this.counts().excused > 1 ? 'Excusées' : 'Excusée'));

  protected day(r: StudentAttendanceDto): string {
    return dayTitle(r.record.date);
  }
  protected course(r: StudentAttendanceDto): string {
    return subjectName(r.event.subjectId) || r.event.title;
  }
  protected time(r: StudentAttendanceDto): string {
    const span = timeSpan(r.event.startTime, r.event.endTime);
    return r.record.status === 'late' && r.record.minutesLate ? `${span} (${r.record.minutesLate} min de retard)` : span;
  }
  protected status(r: StudentAttendanceDto): string {
    return ATTENDANCE_LABELS[r.record.status];
  }
  protected tone(r: StudentAttendanceDto) {
    return ATTENDANCE_TONES[r.record.status];
  }
}
