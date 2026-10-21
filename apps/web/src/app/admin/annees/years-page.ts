import { Component, inject, resource, signal } from '@angular/core';
import type { SchoolYearDto, PeriodDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Badge, Button, EmptyState, Icon } from '../../ui';
import { ConfirmModal } from '../shared/confirm-modal';
import { formatDay, formatRange } from '../shared/admin-format';
import { TermCreateModal } from './term-create-modal';
import { YearCreateModal } from './year-create-modal';

/** School years and their terms: create, set the current year, add, close and delete terms, delete unused years. */
@Component({
  selector: 'app-years-page',
  imports: [Alert, Badge, Button, EmptyState, Icon, ConfirmModal, TermCreateModal, YearCreateModal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Années et trimestres</h1>
        <p class="t-muted">L’année en cours règle les classes, les inscriptions et les comptes affichés partout.</p>
      </div>
      <div class="page__actions">
        <button cdlsButton type="button" (click)="yearOpen.set(true)"><cdls-icon name="plus" />Nouvelle année</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    @if (years.error()) {
      <cdls-alert tone="danger">{{ errorText(years.error()) }}</cdls-alert>
    } @else if (years.hasValue()) {
      @if (years.value().length) {
        <div class="stack years">
          @for (year of years.value(); track year.id) {
            <section class="card card--panel year" [attr.aria-labelledby]="'year-' + year.id">
              <div class="year__head">
                <div class="stack stack--sm">
                  <h2 class="t-h2" [id]="'year-' + year.id">
                    Année {{ year.label }}
                    @if (year.isCurrent) {
                      <cdls-badge tone="success">En cours</cdls-badge>
                    }
                  </h2>
                  <p class="t-muted">{{ range(year.startsOn, year.endsOn) }}</p>
                </div>
                <div class="page__actions">
                  @if (!year.isCurrent) {
                    <button cdlsButton variant="secondary" size="sm" type="button" (click)="startSetCurrent(year)">
                      Définir comme année en cours<span class="visually-hidden"> : {{ year.label }}</span>
                    </button>
                  }
                  @if (year.periods.length < 4) {
                    <button cdlsButton variant="secondary" size="sm" type="button" (click)="startTerm(year)">
                      <cdls-icon name="plus" />Ajouter un trimestre<span class="visually-hidden"> à {{ year.label }}</span>
                    </button>
                  }
                  @if (!year.isCurrent) {
                    <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startDeleteYear(year)">
                      Supprimer l’année<span class="visually-hidden"> {{ year.label }}</span>
                    </button>
                  }
                </div>
              </div>

              @if (year.periods.length) {
                <div class="table-wrap" role="region" [attr.aria-labelledby]="'terms-' + year.id" tabindex="0">
                  <table class="table table--stack">
                    <caption class="visually-hidden" [id]="'terms-' + year.id">Trimestres de l’année {{ year.label }}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Trimestre</th>
                        <th scope="col">Période</th>
                        <th scope="col">Statut</th>
                        <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (term of year.periods; track term.id) {
                        <tr>
                          <th scope="row">{{ term.label }}</th>
                          <td data-label="Période :">{{ range(term.startsOn, term.endsOn) }}</td>
                          <td data-label="Statut :">
                            @if (term.closedAt) {
                              <cdls-badge tone="neutral">Clôturé</cdls-badge>
                            } @else {
                              <cdls-badge tone="info">Ouvert</cdls-badge>
                            }
                          </td>
                          <td class="num">
                            <span class="row-actions">
                              @if (!term.closedAt) {
                                <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startClose(term, year)">
                                  Clôturer<span class="visually-hidden"> le {{ term.label }} {{ year.label }}</span>
                                </button>
                              } @else {
                                <span class="t-body-s t-muted">Le {{ day(term.closedAt) }}</span>
                              }
                              <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startDeleteTerm(term, year)">
                                Supprimer<span class="visually-hidden"> le {{ term.label }} {{ year.label }}</span>
                              </button>
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="t-muted">Aucun trimestre : ajoutez le premier.</p>
              }
            </section>
          }
        </div>
      } @else {
        <cdls-empty-state icon="calendar" title="Aucune année scolaire" description="Créez la première année, puis ses trimestres.">
          <button cdlsButton variant="secondary" type="button" (click)="yearOpen.set(true)">Nouvelle année</button>
        </cdls-empty-state>
      }
    } @else {
      <p class="loading-line" role="status">Chargement des années…</p>
    }

    <app-year-create-modal [(open)]="yearOpen" (created)="onYearCreated($event)" />
    <app-term-create-modal [(open)]="termOpen" [year]="termYear()" (created)="onTermCreated($event)" />

    <app-confirm-modal
      title="Changer d’année en cours ?"
      confirmLabel="Définir comme année en cours"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="currentOpen"
      (confirmed)="setCurrent()"
    >
      <p>
        <strong>{{ pendingYear()?.label }}</strong> devient l’année en cours pour tout le collège : classes, inscriptions et
        espaces des élèves et des enseignants suivent ce changement.
      </p>
    </app-confirm-modal>

    <app-confirm-modal
      title="Clôturer ce trimestre ?"
      confirmLabel="Clôturer le trimestre"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="closeOpen"
      (confirmed)="closeTerm()"
    >
      <p>
        La clôture du <strong>{{ pendingTerm()?.label }} {{ pendingYear()?.label }}</strong> verrouille ses notes : ce sont
        elles qui servent à calculer les bulletins.
      </p>
      <p>Clôturez seulement quand tous les enseignants ont saisi et publié leurs notes.</p>
    </app-confirm-modal>

    <app-confirm-modal
      title="Supprimer cette année ?"
      confirmLabel="Supprimer l’année"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="deleteYearOpen"
      (confirmed)="deleteYear()"
    >
      <p>L’année <strong>{{ pendingYear()?.label }}</strong> et ses trimestres seront supprimés.</p>
      <p class="t-body-s t-muted">Seule une année sans classe, qui n’est pas l’année en cours, peut être supprimée.</p>
    </app-confirm-modal>

    <app-confirm-modal
      title="Supprimer ce trimestre ?"
      confirmLabel="Supprimer le trimestre"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="deleteTermOpen"
      (confirmed)="deleteTerm()"
    >
      <p>Le <strong>{{ pendingTerm()?.label }} {{ pendingYear()?.label }}</strong> sera supprimé.</p>
      <p class="t-body-s t-muted">Seul un trimestre sans note ni bulletin peut être supprimé.</p>
    </app-confirm-modal>
  `,
  styles: `
    .years {
      gap: var(--space-8);
    }
    .year {
      display: grid;
      gap: var(--space-6);
    }
    .year__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
    }
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-1) var(--space-3);
    }
    .year h2 {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
  `,
})
export class YearsPage {
  readonly #api = inject(ApiClient);

  protected readonly years = resource({ loader: () => this.#api.school.years() });

  protected readonly yearOpen = signal(false);
  protected readonly termOpen = signal(false);
  protected readonly termYear = signal<SchoolYearDto | null>(null);
  protected readonly currentOpen = signal(false);
  protected readonly closeOpen = signal(false);
  protected readonly deleteYearOpen = signal(false);
  protected readonly deleteTermOpen = signal(false);
  protected readonly pendingYear = signal<SchoolYearDto | null>(null);
  protected readonly pendingTerm = signal<PeriodDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected range(start: string, end: string): string {
    const text = formatRange(start, end);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  protected day(iso: string): string {
    return formatDay(iso.slice(0, 10));
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les années scolaires. Réessayez dans un instant.');
  }

  protected onYearCreated(year: SchoolYearDto): void {
    this.notice.set(`Année ${year.label} créée. Ajoutez-lui ses trimestres.`);
    this.years.reload();
  }

  protected onTermCreated(term: PeriodDto): void {
    this.notice.set(`${term.label} ajouté.`);
    this.years.reload();
  }

  protected startTerm(year: SchoolYearDto): void {
    this.termYear.set(year);
    this.termOpen.set(true);
  }

  protected startSetCurrent(year: SchoolYearDto): void {
    this.pendingYear.set(year);
    this.actionError.set(null);
    this.currentOpen.set(true);
  }

  protected startClose(term: PeriodDto, year: SchoolYearDto): void {
    this.pendingTerm.set(term);
    this.pendingYear.set(year);
    this.actionError.set(null);
    this.closeOpen.set(true);
  }

  protected startDeleteYear(year: SchoolYearDto): void {
    this.pendingYear.set(year);
    this.actionError.set(null);
    this.deleteYearOpen.set(true);
  }

  protected startDeleteTerm(term: PeriodDto, year: SchoolYearDto): void {
    this.pendingTerm.set(term);
    this.pendingYear.set(year);
    this.actionError.set(null);
    this.deleteTermOpen.set(true);
  }

  protected async deleteYear(): Promise<void> {
    const year = this.pendingYear();
    if (!year) return;
    await this.#run(async () => {
      await this.#api.school.deleteYear(year.id);
      this.deleteYearOpen.set(false);
      this.notice.set(`Année ${year.label} supprimée.`);
    });
  }

  protected async deleteTerm(): Promise<void> {
    const term = this.pendingTerm();
    const year = this.pendingYear();
    if (!term || !year) return;
    await this.#run(async () => {
      await this.#api.school.deleteTerm(term.id);
      this.deleteTermOpen.set(false);
      this.notice.set(`${term.label} ${year.label} supprimé.`);
    });
  }

  protected async setCurrent(): Promise<void> {
    const year = this.pendingYear();
    if (!year) return;
    await this.#run(async () => {
      await this.#api.school.setCurrentYear(year.id);
      this.currentOpen.set(false);
      this.notice.set(`${year.label} est désormais l’année en cours.`);
    });
  }

  protected async closeTerm(): Promise<void> {
    const term = this.pendingTerm();
    if (!term) return;
    await this.#run(async () => {
      await this.#api.school.closeTerm(term.id);
      this.closeOpen.set(false);
      this.notice.set(`${term.label} clôturé : vous pouvez générer ses bulletins.`);
    });
  }

  async #run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
      this.years.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
