import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RolloverResult } from '@cdls/shared';
import { Alert, Button, Icon } from '../../ui';
import { plural } from '../shared/admin-format';

/** Step 5: what was done, what to check, and a link to every class created for the new year. */
@Component({
  selector: 'app-result-step',
  imports: [RouterLink, Alert, Button, Icon],
  template: `
    <div class="stack">
      @if (result().nothingToDo) {
        <cdls-alert tone="info">Tout était déjà en place : rien n’a été créé ni modifié.</cdls-alert>
      } @else {
        <cdls-alert tone="success">
          L’année <strong>{{ result().schoolYearLabel }}</strong> est prête. L’ancienne année est archivée en lecture seule.
        </cdls-alert>
      }

      @if (issues().length) {
        <section class="stack stack--sm" aria-labelledby="result-issues-title">
          <h3 class="t-h3" id="result-issues-title">À reprendre ({{ issues().length }})</h3>
          <ul class="issues">
            @for (issue of issues(); track $index) {
              <li>{{ issue.message }}</li>
            }
          </ul>
        </section>
      }

      <section class="stack stack--sm" aria-labelledby="result-steps-title">
        <h3 class="t-h2" id="result-steps-title">Ce qui a été fait</h3>
        <div class="table-wrap" role="region" aria-labelledby="result-steps-caption" tabindex="0">
          <table class="table table--stack">
            <caption id="result-steps-caption" class="visually-hidden">Éléments créés, déjà présents et laissés de côté, par étape</caption>
            <thead>
              <tr>
                <th scope="col">Étape</th>
                <th scope="col" class="num">Créés</th>
                <th scope="col" class="num">Déjà là</th>
                <th scope="col" class="num">Laissés de côté</th>
              </tr>
            </thead>
            <tbody>
              @for (step of result().steps; track step.id) {
                <tr>
                  <th scope="row">{{ step.label }}</th>
                  <td class="num" data-label="Créés :">{{ step.create }}</td>
                  <td class="num" data-label="Déjà là :">{{ step.existing }}</td>
                  <td class="num" data-label="Laissés de côté :">{{ step.skipped }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="stack stack--sm" aria-labelledby="result-classes-title">
        <h3 class="t-h2" id="result-classes-title">Les classes de {{ result().schoolYearLabel }}</h3>
        <ul class="class-links">
          @for (c of result().classes; track c.sourceClassId) {
            <li>
              @if (c.targetClassId) {
                <a [routerLink]="['/admin/classes', c.targetClassId]">
                  {{ c.label }}<span class="visually-hidden"> ({{ c.sectionCode === 'bac' ? 'Bac français' : 'Bac nationale' }}, nouvelle année)</span>
                </a>
              } @else {
                {{ c.label }}
              }
              <span class="t-muted"> · {{ c.sectionCode === 'bac' ? 'Bac français' : 'Bac nationale' }}</span>
            </li>
          }
        </ul>
      </section>

      <div class="page__actions">
        <a cdlsButton variant="secondary" routerLink="/admin/annees"><cdls-icon name="calendar" />Voir l’année scolaire</a>
        <a cdlsButton variant="tertiary" routerLink="/admin/validations">Validations</a>
      </div>
      <p class="t-body-s t-muted">{{ students() }}</p>
    </div>
  `,
  styles: `
    .issues,
    .class-links {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding-left: var(--space-5);
      list-style: disc;
    }
  `,
})
export class ResultStep {
  readonly result = input.required<RolloverResult>();

  protected readonly issues = computed(() => this.result().issues);
  protected readonly students = computed(() => {
    const c = this.result().studentCounts;
    const parts = [
      c.promote + c.section_change ? `${plural(c.promote + c.section_change, 'élève promu', 'élèves promus')}` : '',
      c.repeat ? plural(c.repeat, 'redoublement', 'redoublements') : '',
      c.graduate ? plural(c.graduate, 'diplômé', 'diplômés') : '',
      c.leave ? plural(c.leave, 'départ', 'départs') : '',
      c.section_change ? plural(c.section_change, 'demande de changement de section ouverte', 'demandes de changement de section ouvertes') : '',
    ].filter(Boolean);
    return parts.length ? `Élèves : ${parts.join(', ')}.` : '';
  });
}
