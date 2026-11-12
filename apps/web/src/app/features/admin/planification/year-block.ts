import { Component, computed, inject, resource } from '@angular/core';
import { CALENDAR_DAY_TYPE_LABELS, type CalendarDayDto, type SchoolYearDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { SchoolYears } from '../../../shared/data/school-years';
import { Badge } from '../../../shared/ui';
import {
  blockState,
  bothOf,
  LOADING,
  type Snapshot,
  snapshotOf,
} from '../../../shared/utils/block-state';
import { dateRangeText, type TermState, type TermView, yearView } from './planner-views';

const STATE_WORDS: Readonly<Record<TermState, string>> = {
  past: 'terminé',
  current: 'en cours',
  next: 'à venir',
};

/**
 * « L'année »: the terms of the school year, the exam weeks and holidays still to come, and the next key date.
 * The calendar days are loaded with the years; the block shows loading or the error until both are here.
 */
@Component({
  selector: 'app-year-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="L’année"
      headingId="bloc-annee"
      [state]="s"
      [wide]="true"
      link="/admin/annees"
      linkLabel="Calendrier de l’année"
      loadingLabel="Chargement de l’année…"
      emptyText="Aucune année scolaire n’est encore créée."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <p class="year__next">
          @if (s.data.next; as next) {
            Prochaine date clé : <strong>{{ next.label }}</strong
            >, {{ range(next.startsOn, next.endsOn) }}.
          } @else {
            Aucune semaine d’examens ni vacances à venir dans le calendrier.
          }
        </p>
        <h3 class="year__title" id="bloc-annee-trimestres">Les trimestres de {{ s.data.label }}</h3>
        <ol class="year__terms" role="list" aria-labelledby="bloc-annee-trimestres">
          @for (t of s.data.terms; track t.id) {
            <li class="year__term" [class.year__term--current]="t.state === 'current'">
              <p class="year__term-name">{{ t.label }}</p>
              <p class="list__meta">{{ termDates(t) }}</p>
              <cdls-badge [tone]="t.state === 'current' ? 'info' : 'neutral'">{{
                stateWord(t.state)
              }}</cdls-badge>
            </li>
          }
        </ol>
        @if (s.data.keyDates.length) {
          <h3 class="year__title" id="bloc-annee-dates">À venir</h3>
          <ul class="list" role="list" aria-labelledby="bloc-annee-dates">
            @for (d of s.data.keyDates; track d.id) {
              <li>
                <div class="list__main">
                  <p>{{ d.label }}</p>
                  <p class="list__meta">{{ range(d.startsOn, d.endsOn) }}</p>
                </div>
                <cdls-badge [tone]="d.type === 'exam_week' ? 'warning' : 'neutral'">{{
                  typeLabel(d.type)
                }}</cdls-badge>
              </li>
            }
          </ul>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    p {
      margin: 0;
    }
    .year__title {
      margin: 0;
      font-size: var(--text-label-m);
      font-weight: 600;
      color: var(--color-heading);
    }
    .year__terms {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .year__term {
      display: grid;
      gap: var(--space-1);
      justify-items: start;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
    }
    .year__term--current {
      border-color: var(--color-heading);
    }
    .year__term-name {
      font-weight: 600;
      color: var(--color-heading);
    }
    @media (min-width: 48rem) {
      .year__terms {
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      }
    }
  `,
})
export class YearBlock {
  readonly #api = inject(ApiClient);
  readonly #clock = inject(SchoolClock);
  readonly #years = inject(SchoolYears);

  protected readonly range = dateRangeText;
  protected readonly stateWord = (state: TermState) => STATE_WORDS[state];
  protected readonly typeLabel = (type: keyof typeof CALENDAR_DAY_TYPE_LABELS) =>
    CALENDAR_DAY_TYPE_LABELS[type];

  readonly #days = resource({
    params: () => this.#years.year()?.id,
    loader: ({ params: schoolYearId }) => this.#api.school.calendarDays({ schoolYearId }),
  });

  /** The years and the calendar days both have to answer; either failing is the block's error (never a false « nothing to come »). */
  protected readonly state = computed(() => {
    const year = this.#years.year();
    const years: Snapshot<SchoolYearDto | null> = this.#years.settled()
      ? { error: this.#years.years.error(), value: year }
      : LOADING;
    // Without a year there are no days to ask for.
    const days: Snapshot<readonly CalendarDayDto[]> = year
      ? snapshotOf(this.#days)
      : { error: undefined, value: [] };
    return blockState(bothOf(years, days), ([y, d]) => yearView(y, d, this.#clock.today()));
  });

  protected reload(): void {
    this.#years.reload();
    this.#days.reload();
  }

  protected termDates(t: TermView): string {
    return this.range(t.startsOn, t.endsOn);
  }
}
