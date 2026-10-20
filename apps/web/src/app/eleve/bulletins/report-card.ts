import { Component, computed, input } from '@angular/core';
import type { ReportCardDto } from '@cdls/shared';
import { average, longDate, mark } from '../shared/format';

/** The term report card, laid out like the PDF (prototype eleve-bulletin.html). */
@Component({
  selector: 'app-report-card',
  template: `
    <article class="bulletin" aria-labelledby="bulletin-title">
      <header class="bulletin__head">
        <div class="wordmark">
          <svg class="wordmark__crest" aria-hidden="true" focusable="false"><use href="/icons.svg#crest" /></svg>
          <span class="wordmark__text">
            <span class="wordmark__name">Collège de la Salle</span>
            <span class="wordmark__place">Daher, Le Caire</span>
          </span>
        </div>
        <div class="stack stack--sm">
          <h2 id="bulletin-title" class="t-h2">Bulletin du {{ termLabel() }}</h2>
          @if (yearLabel()) {
            <p class="t-muted t-body-s">Année scolaire {{ yearLabel() }}</p>
          }
        </div>
      </header>

      <dl class="bulletin__id">
        <dt>Élève</dt>
        <dd>{{ card().studentName }}</dd>
        @if (classLabel()) {
          <dt>Classe</dt>
          <dd>{{ classLabel() }}</dd>
        }
      </dl>

      <div class="table-wrap table-wrap--flat" role="region" aria-labelledby="bulletin-caption" tabindex="0">
        <table class="table">
          <caption id="bulletin-caption" class="visually-hidden">Résultats par matière</caption>
          <thead>
            <tr>
              <th scope="col">Matière</th>
              <th scope="col" class="num">Coefficient</th>
              <th scope="col" class="num">Notes</th>
              <th scope="col" class="num">Moyenne</th>
            </tr>
          </thead>
          <tbody>
            @for (s of card().subjects; track s.subjectId) {
              <tr>
                <th scope="row">{{ s.subjectName }}</th>
                <td class="num">{{ format(s.coefficient) }}</td>
                <td class="num">{{ s.gradeCount }}</td>
                <td class="num"><b>{{ avg(s.average) }}</b></td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="bulletin__summary">
        <div class="bulletin__box stat">
          <span class="stat__value tabular">{{ avg(card().average) }}</span>
          <span class="stat__label">Moyenne générale de l’élève</span>
        </div>
        <div class="bulletin__box stat">
          <span class="stat__value stat__value--muted tabular">{{ card().rank ?? '–' }}</span>
          <span class="stat__label">Rang dans la classe</span>
        </div>
        <div class="bulletin__box stack stack--sm">
          <p class="t-label">Vie scolaire</p>
          <p class="t-body-s">{{ schoolLife() }}</p>
        </div>
      </div>

      <section class="bulletin__council" aria-labelledby="council">
        <h3 id="council" class="t-h3">Appréciation générale</h3>
        <p>{{ card().appreciation || 'Pas d’appréciation pour ce trimestre.' }}</p>
      </section>

      <footer class="bulletin__signature">
        <p>{{ issued() }}</p>
        <p>Pour le directeur du collège, le coordinateur de la section</p>
      </footer>
    </article>
  `,
})
export class ReportCard {
  readonly card = input.required<ReportCardDto>();
  readonly termLabel = input('trimestre');
  readonly yearLabel = input('');
  readonly classLabel = input('');
  /** « 1 absence, 2 retards » over the term, or '' when unknown. */
  readonly schoolLife = input('');

  protected readonly issued = computed(() => {
    const at = this.card().publishedAt ?? this.card().generatedAt;
    return `${this.card().publishedAt ? 'Publié' : 'Établi'} le ${longDate(at.slice(0, 10))}`;
  });

  protected avg(value: number | null): string {
    return average(value);
  }
  protected format(value: number): string {
    return mark(value);
  }
}
