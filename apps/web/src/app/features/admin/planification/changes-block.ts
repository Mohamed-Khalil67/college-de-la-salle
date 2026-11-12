import { Component, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { Badge } from '../../../shared/ui';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { plural, timeSpan } from '../../../shared/utils/format';
import { changeSummary, changesView } from './planner-views';

/**
 * « Changements aujourd'hui »: the lessons that are not what the weekly timetable says today (cancelled and not
 * covered, covered, supervised study, other room, moved) and whether the students were told.
 */
@Component({
  selector: 'app-changes-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Changements aujourd’hui"
      headingId="bloc-changements"
      [state]="s"
      link="/admin/emploi-du-temps"
      linkLabel="Toutes les modifications"
      loadingLabel="Chargement des changements…"
      emptyText="Aucun changement aujourd’hui : toutes les séances ont lieu comme prévu."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <div class="changes__counts">
          <p class="stat">
            <span class="stat__value tabular">{{ s.data.toCover }}</span>
            <span class="stat__label">{{
              s.data.toCover > 1 ? 'séances à couvrir' : 'séance à couvrir'
            }}</span>
          </p>
          <p class="stat">
            <span class="stat__value tabular">{{ s.data.covered + s.data.study }}</span>
            <span class="stat__label">prises en charge</span>
          </p>
        </div>
        @if (s.data.untold) {
          <p>
            <cdls-badge tone="warning"
              >{{ plural(s.data.untold, 'changement', 'changements') }} sans prévenir les
              élèves</cdls-badge
            >
          </p>
        } @else {
          <p><cdls-badge tone="success">Élèves prévenus</cdls-badge></p>
        }
        <ul class="list" role="list" aria-label="Séances modifiées aujourd’hui">
          @for (c of s.data.shown; track c.slotId + c.date) {
            <li>
              <div class="list__main">
                <p>{{ c.subjectName }}, {{ c.classLabel }}</p>
                <p class="list__meta">{{ span(c.startTime, c.endTime) }} · {{ summary(c) }}</p>
              </div>
            </li>
          }
        </ul>
        @if (s.data.more > 0) {
          <p class="list__meta">et {{ plural(s.data.more, 'autre séance', 'autres séances') }}</p>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .changes__counts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-8);
    }
    .changes__counts p,
    p {
      margin: 0;
    }
  `,
})
export class ChangesBlock {
  readonly #api = inject(ApiClient);
  readonly #clock = inject(SchoolClock);
  protected readonly plural = plural;
  protected readonly summary = changeSummary;
  protected readonly span = timeSpan;

  readonly #today = resource({
    params: () => this.#clock.today(),
    loader: ({ params: day }) => this.#api.planner.today(day),
  });

  protected readonly state = computed(() => blockState(snapshotOf(this.#today), changesView));

  protected reload(): void {
    this.#today.reload();
  }
}
