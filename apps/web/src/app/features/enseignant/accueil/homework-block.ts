import { Component, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { blockState, type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { subjectName } from '../../../shared/utils/format';
import { dueLabel, givenHomework, type HomeworkRow, homeworkView, ticksLine } from './home-views';
import { TeacherHomeData } from './teacher-home-data';

/**
 * « Devoirs donnés »: the homework the teacher gave that falls due in the next two weeks, soonest first,
 * with how many students ticked it (the same figure as on the full list).
 */
@Component({
  selector: 'app-homework-block',
  imports: [HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Devoirs donnés"
      headingId="bloc-devoirs"
      [state]="s"
      link="agenda"
      linkLabel="Tous mes devoirs"
      loadingLabel="Chargement des devoirs…"
      emptyText="Aucun devoir à rendre d’ici deux semaines. Donnez-en un depuis « Mes cours aujourd’hui »."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <ul class="list" role="list" aria-label="Devoirs donnés">
          @for (row of s.data; track row.occurrence.key) {
            <li>
              <div class="list__main">
                <p>{{ row.occurrence.event.title }}</p>
                <p class="list__meta">{{ meta(row) }}</p>
                @if (ticks(row); as line) {
                  <p class="homework__ticks">{{ line }}</p>
                }
              </div>
              <p class="homework__day">{{ due(row) }}</p>
            </li>
          }
        </ul>
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .list p {
      margin: 0;
    }
    .list .homework__ticks {
      margin-top: var(--space-1);
      font-size: var(--text-body-s);
      font-weight: 600;
      color: var(--color-heading);
    }
    .homework__day {
      flex: none;
      font-size: var(--text-body-s);
      font-weight: 600;
      color: var(--color-heading);
      white-space: nowrap;
    }
  `,
})
export class HomeworkBlock {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #today = inject(SchoolClock).today;
  readonly #data = inject(TeacherHomeData);

  /** The tick counts of the homework found in the page's shared events; a count that fails is left blank. */
  readonly #rows = resource({
    params: () => {
      const teacherId = this.#auth.user()?.teacherId;
      return teacherId && this.#data.events.hasValue() ? { teacherId, events: this.#data.events.value(), today: this.#today() } : undefined;
    },
    loader: async ({ params }): Promise<HomeworkRow[]> =>
      Promise.all(
        givenHomework(params.events, params.teacherId, params.today).map(async (occurrence) => ({
          occurrence,
          done: await this.#api.calendar.completions(occurrence.event.id).then(
            (list) => list.length,
            () => null,
          ),
        })),
      ),
  });

  protected readonly state = computed(() => {
    const error = this.#data.events.error();
    const source: Snapshot<HomeworkRow[]> = error ? { error, value: undefined } : snapshotOf(this.#rows);
    return blockState(source, homeworkView);
  });

  protected reload(): void {
    if (this.#data.events.error()) this.#data.reloadEvents();
    else if (this.#rows.error() && !this.#rows.isLoading()) this.#rows.reload();
  }

  protected meta(row: HomeworkRow): string {
    const event = row.occurrence.event;
    return [subjectName(event.subjectId), this.#data.classLabels().get(event.classId ?? '') ?? ''].filter(Boolean).join(', ');
  }
  protected ticks(row: HomeworkRow): string {
    return row.done === null ? '' : ticksLine(row.done, row.occurrence.event.target.concerned);
  }
  protected due(row: HomeworkRow): string {
    return dueLabel(row.occurrence.day, this.#today());
  }
}
