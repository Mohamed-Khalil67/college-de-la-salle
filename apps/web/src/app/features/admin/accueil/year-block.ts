import { Component, computed, inject } from '@angular/core';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { SchoolYears } from '../../../shared/data/school-years';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { longDate, plural } from '../../../shared/utils/format';
import { yearView } from './admin-home-views';

/** « Année scolaire »: the current year, the term of today and the year being prepared, if any. */
@Component({
  selector: 'app-year-block',
  imports: [HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Année scolaire"
      headingId="bloc-annee"
      [state]="s"
      link="nouvelle-annee"
      linkLabel="Nouvelle année"
      loadingLabel="Chargement de l’année…"
      emptyText="Aucune année scolaire en cours. Créez-la pour ouvrir les classes et les trimestres."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <p class="stat">
          <span class="stat__value">{{ s.data.year.label }}</span>
          <span class="stat__label">{{ termText() }}</span>
        </p>
        <p class="year__line">
          Fin de l’année le {{ date(s.data.year.endsOn) }}, dans {{ plural(s.data.daysLeft, 'jour') }}.
        </p>
        @if (s.data.next; as next) {
          <p class="year__line">L’année {{ next.label }} est déjà préparée.</p>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .stat,
    .year__line {
      margin: 0;
    }
  `,
})
export class YearBlock {
  readonly #years = inject(SchoolYears);
  readonly #today = inject(SchoolClock).today;

  protected readonly state = computed(() =>
    blockState(snapshotOf(this.#years.years), (years) => yearView(years, this.#today())),
  );
  protected readonly termText = computed(() => {
    const s = this.state();
    if (s.status !== 'ready') return '';
    return s.data.term ? `en cours : ${s.data.term.label}` : 'entre deux trimestres';
  });

  protected readonly plural = plural;
  protected readonly date = longDate;

  protected reload(): void {
    this.#years.reload();
  }
}
