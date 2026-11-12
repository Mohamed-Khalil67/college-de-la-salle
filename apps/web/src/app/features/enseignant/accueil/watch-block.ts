import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OccurrenceDto } from '@cdls/shared';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { Button } from '../../../shared/ui';
import { blockState, type Snapshot } from '../../../shared/utils/block-state';
import { subjectName } from '../../../shared/utils/format';
import { shortDate } from '../../timetable/timetable-format';
import { type LateNote, lateLine, lateNotes, type PendingEntry, upcomingTests, watchView } from './home-views';
import { TeacherHomeData } from './teacher-home-data';

interface WatchSource {
  readonly pending: readonly PendingEntry[];
  readonly events: readonly OccurrenceDto[];
}

/**
 * « À surveiller »: the notes still unfinished a week after the work, and the exams and tests planned for the
 * teacher's classes in the next two weeks (including those set by the school). Both lists come from the
 * page's shared data (nothing is fetched twice); if one cannot be read the block says so.
 */
@Component({
  selector: 'app-watch-block',
  imports: [Button, HomeBlock, RouterLink],
  template: `
    @let s = state();
    <app-home-block
      heading="À surveiller"
      headingId="bloc-surveiller"
      [state]="s"
      link="classes"
      linkLabel="Mes classes"
      loadingLabel="Chargement des points à surveiller…"
      emptyText="Rien à signaler : pas de note en retard ni de contrôle prévu d’ici deux semaines."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        @if (s.data.late.length) {
          <div class="watch">
            <h3 class="watch__title" id="bloc-surveiller-retard">Notes en retard</h3>
            <ul class="list" role="list" aria-labelledby="bloc-surveiller-retard">
              @for (note of s.data.late; track note.eventId) {
                <li class="watch__late">
                  <div class="list__main">
                    <p>{{ note.title }}</p>
                    <p class="list__meta">{{ note.meta }}</p>
                    <p class="list__meta">{{ line(note) }}</p>
                  </div>
                  <a
                    cdlsButton
                    variant="tertiary"
                    routerLink="noter"
                    [queryParams]="{ classe: note.classId, matiere: note.subjectId }"
                    >Reprendre<span class="visually-hidden"> la note {{ note.title }}, {{ note.meta }}</span></a
                  >
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
    .watch__late {
      align-items: center;
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
  readonly #today = inject(SchoolClock).today;
  readonly #data = inject(TeacherHomeData);

  /** Any source failing is the block failing (a half-read list would say « nothing to watch » wrongly); it loads until all are in. */
  protected readonly state = computed(() => {
    const error = this.#data.assignments.error() ?? this.#data.pending.error() ?? this.#data.events.error();
    const ready = this.#data.assignments.hasValue() && this.#data.pending.hasValue() && this.#data.events.hasValue();
    const source: Snapshot<WatchSource> = error
      ? { error, value: undefined }
      : { error: undefined, value: ready ? { pending: this.#data.pending.value(), events: this.#data.events.value() } : undefined };
    const classIds = new Set(this.#data.assignments.hasValue() ? this.#data.assignments.value().map((a) => a.classId) : []);
    return blockState(source, ({ pending, events }) =>
      watchView(lateNotes(pending, this.#today()), upcomingTests(events, classIds, this.#today())),
    );
  });

  protected reload(): void {
    this.#data.reload();
    this.#data.reloadEvents();
  }

  protected line(note: LateNote): string {
    return lateLine(note);
  }
  protected testMeta(test: OccurrenceDto): string {
    return [this.#data.classLabels().get(test.event.classId ?? ''), subjectName(test.event.subjectId), test.event.type.label]
      .filter(Boolean)
      .join(', ');
  }
  protected day(test: OccurrenceDto): string {
    return shortDate(test.day);
  }
}
