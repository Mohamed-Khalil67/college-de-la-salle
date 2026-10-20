import { Component, computed, input } from '@angular/core';
import type { Resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StudentGradesDto } from '@cdls/shared';
import { average, subjectName } from '../shared/format';
import { meterWidth, overallAverage, subjectsByName } from '../shared/grades';
import { LoadState } from '../shared/load-state';

/** The term's general average and one bar per subject. */
@Component({
  selector: 'app-averages-panel',
  imports: [RouterLink, LoadState],
  host: { class: 'panel span-2' },
  template: `
    <section class="card card--panel" aria-labelledby="avg-title">
      <div class="card__header">
        <h2 id="avg-title" class="t-h3">Moyennes {{ termLabel() ? 'du ' + termLabel() : 'de l’année' }}</h2>
        <a class="t-body-s" routerLink="notes">Détail par matière</a>
      </div>
      <app-load-state [ref]="grades()" label="Chargement des moyennes…" />
      @if (subjects().length) {
        <div class="avg-summary">
          <div class="stat">
            <span class="stat__value tabular">{{ format(overall()) }}</span>
            <span class="stat__label">Ma moyenne générale</span>
          </div>
        </div>
        <ul class="bars" role="list">
          @for (s of subjects(); track s.subjectId) {
            <li>
              <span>{{ name(s.subjectId) }}</span>
              <span class="meter" aria-hidden="true"><span [style.width.%]="width(s.average)"></span></span>
              <span class="tabular">{{ format(s.average) }}</span>
            </li>
          }
        </ul>
      } @else if (grades().hasValue()) {
        <p class="t-muted">Pas encore de moyenne : aucune note publiée pour ce trimestre.</p>
      }
    </section>
  `,
})
export class AveragesPanel {
  readonly grades = input.required<Resource<StudentGradesDto | undefined>>();
  readonly termLabel = input('');

  protected readonly subjects = computed(() => {
    const data = this.grades().hasValue() ? this.grades().value() : undefined;
    return data ? subjectsByName(data).filter((s) => s.average !== null) : [];
  });
  protected readonly overall = computed(() => overallAverage(this.subjects()));

  protected name(id: string): string {
    return subjectName(id) || 'Autre';
  }
  protected format(value: number | null): string {
    return average(value);
  }
  protected width(value: number | null): number {
    return meterWidth(value);
  }
}
