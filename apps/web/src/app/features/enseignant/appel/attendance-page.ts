import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { isCalendarDay, type OccurrenceDto, todayIso } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { EmptyState } from '../../../shared/ui';
import { dayTitle, kindLabel, subjectName, timeSpan } from '../../../shared/utils/format';
import { LoadState } from '../../../shared/components/load-state';
import { teacherAssignments } from '../../../shared/data/teacher-data';
import { RollCall } from './roll-call';

/** Roll call: pick a class, a day and one of that day's class sessions, then mark each student. */
@Component({
  selector: 'app-attendance-page',
  imports: [EmptyState, LoadState, RollCall],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Appel{{ className() ? ' de la classe ' + className() : '' }}</h1>
        <p class="t-muted">{{ subtitle() }}</p>
      </div>
    </div>

    <app-load-state [ref]="assignments" label="Chargement de vos classes…" />
    @if (assignments.hasValue()) {
      @if (classes().length) {
        <div class="filters picker">
          <div class="field">
            <label class="field__label" for="appel-classe">Classe</label>
            <select class="field__control" id="appel-classe" (change)="classId.set($any($event.target).value)">
              @for (c of classes(); track c.id) {
                <option [value]="c.id" [selected]="c.id === classId()">{{ c.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="appel-date">Jour</label>
            <input class="field__control" id="appel-date" type="date" [value]="date()" (change)="setDate($any($event.target).value)" />
          </div>
          @if (sessions().length) {
            <div class="field">
              <label class="field__label" for="appel-seance">Séance</label>
              <select class="field__control" id="appel-seance" (change)="sessionKey.set($any($event.target).value)">
                @for (s of sessions(); track s.key) {
                  <option [value]="s.key" [selected]="s.key === sessionKey()">{{ sessionLabel(s) }}</option>
                }
              </select>
            </div>
          }
        </div>

        <app-load-state [ref]="day" label="Chargement des séances…" />
        @if (day.hasValue()) {
          @if (session(); as s) {
            <app-roll-call [eventId]="s.event.id" [date]="s.day" />
          } @else {
            <cdls-empty-state icon="calendar" title="Pas de séance ce jour-là" [description]="'La classe ' + className() + ' n’a pas de cours dans l’agenda le ' + dayLabel() + '. Choisissez un autre jour.'" />
          }
        }
      } @else {
        <cdls-empty-state icon="users" title="Aucune classe" description="Vous n’êtes affecté à aucune classe cette année." />
      }
    }
  `,
  styles: `
    .picker {
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      margin-bottom: var(--space-6);
    }
  `,
})
export class AttendancePage {
  /** ?classe=<id> from « Mes classes ». */
  readonly classe = input<string>();

  readonly #api = inject(ApiClient);
  protected readonly assignments = teacherAssignments();
  protected readonly classes = computed(() => {
    const list = this.assignments.hasValue() ? this.assignments.value() : [];
    return [...new Map(list.map((a) => [a.classId, a.classLabel]))]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  });
  protected readonly classId = linkedSignal(() => {
    const wanted = this.classe();
    return this.classes().find((c) => c.id === wanted)?.id ?? this.classes()[0]?.id ?? '';
  });
  protected readonly className = computed(() => this.classes().find((c) => c.id === this.classId())?.label ?? '');
  protected readonly date = signal(todayIso());
  protected readonly dayLabel = computed(() => dayTitle(this.date()).toLowerCase());

  protected readonly day = resource({
    params: () => (this.classId() ? { from: this.date(), to: this.date(), classId: this.classId() } : undefined),
    loader: ({ params }) => this.#api.calendar.occurrences(params),
  });
  /** Timed sessions of this class (homework deadlines and all-day events are not roll calls). */
  protected readonly sessions = computed(() =>
    (this.day.hasValue() ? this.day.value() : []).filter((o) => o.event.classId === this.classId() && !o.event.type.homework && !!o.event.startTime),
  );
  protected readonly sessionKey = linkedSignal(() => this.sessions()[0]?.key ?? '');
  protected readonly session = computed(() => this.sessions().find((s) => s.key === this.sessionKey()) ?? null);

  protected readonly subtitle = computed(() => {
    const s = this.session();
    if (!s) return dayTitle(this.date());
    const subject = subjectName(s.event.subjectId);
    return [dayTitle(s.day), timeSpan(s.event.startTime, s.event.endTime), subject || s.event.title, s.event.place].filter(Boolean).join(', ');
  });

  protected setDate(value: string): void {
    if (isCalendarDay(value)) this.date.set(value);
  }
  protected sessionLabel(s: OccurrenceDto): string {
    const who = s.event.target.whole ? '' : `, ${s.event.target.groups.map((g) => g.label).join(', ') || 'élèves nommés'}`;
    return `${timeSpan(s.event.startTime, s.event.endTime)}, ${s.event.title} (${kindLabel(s.event.type)}${who})`;
  }
}
