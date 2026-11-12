import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeStatus, HomeStatusRegion } from '../../../shared/components/home-status';
import { Button } from '../../../shared/ui';
import { dayTitle } from '../../../shared/utils/format';
import { ChangesBlock } from './changes-block';
import { FixBlock } from './fix-block';
import { PlannerData } from './planner-data';
import { RoomsBlock } from './rooms-block';
import { TimetablesBlock } from './timetables-block';
import { YearBlock } from './year-block';

/**
 * The planner's one page (« Planification »): what needs deciding, today's changes, the free rooms, the year and
 * the state of the timetables, in blocks that each load their own data and end with one link to their detail
 * page. Two buttons in the header: « Professeur absent » and « Ajouter un examen ». Phone: one column in this order;
 * from tablet width three columns, with the year and the timetables across the row.
 */
@Component({
  selector: 'app-planner-home-page',
  imports: [
    Button,
    ChangesBlock,
    FixBlock,
    HomeStatusRegion,
    RoomsBlock,
    RouterLink,
    TimetablesBlock,
    YearBlock,
  ],
  providers: [HomeStatus, PlannerData],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Planification</h1>
        <p class="t-muted">{{ date() }}</p>
      </div>
      <div class="page__actions">
        <a cdlsButton routerLink="/admin/planification/professeur-absent">Professeur absent</a>
        @if (teaches()) {
          <a cdlsButton variant="secondary" routerLink="/enseignant/agenda">Ajouter un examen</a>
        }
      </div>
    </div>
    <app-home-status />
    <div class="home-grid">
      <app-fix-block />
      <app-changes-block />
      <app-rooms-block />
      <app-year-block />
      <app-timetables-block />
    </div>
  `,
  styles: `
    .home-grid {
      display: grid;
      gap: var(--space-4);
      grid-template-columns: minmax(0, 1fr);
    }
    @media (min-width: 48rem) {
      .home-grid {
        gap: var(--space-6);
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class PlannerHomePage {
  readonly #auth = inject(AuthStore);
  readonly #clock = inject(SchoolClock);
  protected readonly date = computed(() => dayTitle(this.#clock.today()));
  /** « Ajouter un examen » opens the agenda's event form, which only a teacher has (an admin account has no teaching profile). */
  protected readonly teaches = computed(() => !!this.#auth.user()?.teacherId);
}
