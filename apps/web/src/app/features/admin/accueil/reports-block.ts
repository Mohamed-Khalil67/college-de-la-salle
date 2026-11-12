import { Component, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { SchoolYears } from '../../../shared/data/school-years';
import { Badge } from '../../../shared/ui';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { longDate, plural } from '../../../shared/utils/format';
import { reportsView } from './admin-home-views';

/**
 * « Bulletins »: how far the term's grades are (subjects ready for the report cards), when the term ends and
 * which teachers are most behind. The reminders themselves are on the detail page, « Préparer les bulletins ».
 */
@Component({
  selector: 'app-reports-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Bulletins"
      headingId="bloc-bulletins"
      [state]="s"
      link="bulletins/preparation"
      linkLabel="Préparer les bulletins"
      loadingLabel="Chargement des notes du trimestre…"
      emptyText="Rien à préparer pour l’instant : il n’y a pas de trimestre en cours ou pas de classe. Les notes à finir apparaîtront ici."
      [wide]="true"
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <div class="reports">
          <div class="reports__progress">
            <p class="stat">
              <span class="stat__value tabular">{{ s.data.readyPercent }} %</span>
              <span class="stat__label">des matières sont prêtes pour le {{ s.data.termLabel }}</span>
            </p>
            <progress
              class="reports__bar"
              max="100"
              [value]="s.data.readyPercent"
              [attr.aria-label]="'Matières prêtes pour les bulletins : ' + s.data.readySubjects + ' sur ' + s.data.subjectCount"
            ></progress>
            <p class="reports__line">
              {{ s.data.readySubjects }} sur {{ s.data.subjectCount }} matières, {{ s.data.completeClasses }} sur
              {{ s.data.classCount }} {{ s.data.classCount > 1 ? 'classes complètes' : 'classe complète' }}.
            </p>
            <p class="reports__line">
              @if (s.data.closed) {
                <cdls-badge tone="neutral">Trimestre clôturé</cdls-badge>
              } @else {
                Clôture prévue le {{ date(s.data.endsOn) }}, dans {{ plural(s.data.daysLeft, 'jour') }}.
              }
            </p>
          </div>
          <div class="reports__late">
            <h3 class="reports__title">Enseignants en retard</h3>
            @if (s.data.lateTeachers.length) {
              <ul class="list" role="list">
                @for (t of s.data.lateTeachers; track t.teacherId) {
                  <li>
                    <div class="list__main">
                      <p>{{ t.name }}</p>
                    </div>
                    <cdls-badge tone="warning">{{ plural(t.count, 'matière') }} à finir</cdls-badge>
                  </li>
                }
              </ul>
              @if (s.data.lateTeacherCount > s.data.lateTeachers.length) {
                <p class="reports__line">et {{ s.data.lateTeacherCount - s.data.lateTeachers.length }} autres.</p>
              }
            } @else {
              <p class="reports__line">Personne n’est en retard : tout est saisi et publié.</p>
            }
          </div>
        </div>
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .reports {
      display: grid;
      gap: var(--space-6);
    }
    @media (min-width: 48rem) {
      .reports {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .reports__progress,
    .reports__late {
      display: grid;
      align-content: start;
      gap: var(--space-3);
    }
    .reports__progress p,
    .reports__late p,
    .stat {
      margin: 0;
    }
    .reports__bar {
      width: 100%;
      height: 0.75rem;
      accent-color: var(--color-inverse);
    }
    .reports__title {
      margin: 0;
      font-size: var(--text-label-m);
      font-weight: 600;
      color: var(--color-heading);
    }
    .reports__line {
      color: var(--color-body);
    }
  `,
})
export class ReportsBlock {
  readonly #api = inject(ApiClient);
  readonly #years = inject(SchoolYears);
  readonly #today = inject(SchoolClock).today;

  readonly #preparation = resource({
    // Wait for the terms; without a term of today there is nothing to prepare (null: the empty state).
    params: () => (this.#years.settled() ? { periodId: this.#years.term()?.id ?? null } : undefined),
    loader: ({ params }) => (params.periodId ? this.#api.reportCards.preparation(params.periodId) : Promise.resolve(null)),
  });

  protected readonly state = computed(() => blockState(snapshotOf(this.#preparation), (prep) => reportsView(prep, this.#today())));

  protected readonly plural = plural;
  protected readonly date = longDate;

  protected reload(): void {
    if (this.#years.years.error()) this.#years.reload();
    this.#preparation.reload();
  }
}
