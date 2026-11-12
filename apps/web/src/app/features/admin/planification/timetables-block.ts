import { Component, computed, inject } from '@angular/core';
import { HomeBlock } from '../../../shared/components/home-block';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { plural } from '../../../shared/utils/format';
import { PlannerData } from './planner-data';
import { timetablesView } from './planner-views';

/** « Emplois du temps »: how many classes have all their hours placed, and how many teachers have lessons. */
@Component({
  selector: 'app-timetables-block',
  imports: [HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Emplois du temps"
      headingId="bloc-emplois"
      [state]="s"
      [wide]="true"
      link="/admin/emploi-du-temps"
      linkLabel="Ouvrir la grille (classe, enseignant, salle)"
      loadingLabel="Chargement des emplois du temps…"
      emptyText="Aucune classe cette année : créez les classes avant l’emploi du temps."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <div class="tt__counts">
          <p class="stat">
            <span class="stat__value tabular">{{ s.data.complete }}</span>
            <span class="stat__label"
              >{{ s.data.complete > 1 ? 'classes complètes' : 'classe complète' }} sur
              {{ s.data.total }}</span
            >
          </p>
          <p class="stat">
            <span class="stat__value tabular" [class.stat__value--muted]="!s.data.incomplete">{{
              s.data.incomplete
            }}</span>
            <span class="stat__label">{{
              s.data.incomplete > 1 ? 'classes incomplètes' : 'classe incomplète'
            }}</span>
          </p>
          <p class="stat">
            <span class="stat__value tabular">{{ s.data.teachersPlaced }}</span>
            <span class="stat__label"
              >{{ plural(s.data.teachersTotal, 'enseignant placé', 'enseignants placés') }} sur
              {{ s.data.teachersTotal }}</span
            >
          </p>
        </div>
        <div
          class="meter"
          role="img"
          [attr.aria-label]="s.data.percent + ' % des classes ont toutes leurs heures'"
        >
          <span class="meter__fill" [style.width.%]="s.data.percent"></span>
        </div>
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
    .tt__counts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-8);
    }
  `,
})
export class TimetablesBlock {
  readonly #data = inject(PlannerData);
  protected readonly plural = plural;
  protected readonly state = computed(() =>
    blockState(snapshotOf(this.#data.timetables), timetablesView),
  );

  protected reload(): void {
    this.#data.timetables.reload();
  }
}
