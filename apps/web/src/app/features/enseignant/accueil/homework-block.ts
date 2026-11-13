import { Component, computed, inject } from '@angular/core';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { blockState } from '../../../shared/utils/block-state';
import { subjectName } from '../../../shared/utils/format';
import { dueLabel, type HomeworkRow, homeworkView, ticksLine } from './home-views';
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
                <p class="homework__ticks">{{ ticks(row) }}</p>
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
  readonly #today = inject(SchoolClock).today;
  readonly #data = inject(TeacherHomeData);

  protected readonly state = computed(() =>
    blockState(this.#data.section(['homework'], (summary) => summary.homework), homeworkView),
  );

  protected reload(): void {
    this.#data.reload();
  }

  protected meta(row: HomeworkRow): string {
    const event = row.occurrence.event;
    return [subjectName(event.subjectId), this.#data.classLabels().get(event.classId ?? '') ?? ''].filter(Boolean).join(', ');
  }
  protected ticks(row: HomeworkRow): string {
    return ticksLine(row.done, row.occurrence.event.target.concerned);
  }
  protected due(row: HomeworkRow): string {
    return dueLabel(row.occurrence.day, this.#today());
  }
}
