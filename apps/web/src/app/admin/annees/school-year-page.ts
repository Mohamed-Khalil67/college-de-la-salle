import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { type SchoolYearDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';
import { Alert, Badge, Button, EmptyState, Field, FieldControl, Icon } from '../../ui';
import { ArchivedBanner } from '../shared/archived-banner';
import { ConfirmModal } from '../shared/confirm-modal';
import { formatDay, formatRange } from '../shared/admin-format';
import { focusPageHeading } from '../shared/focus';
import { YearChecklist } from './year-checklist';
import { YearCreateModal } from './year-create-modal';
import { YearDatesModal } from './year-dates-modal';
import { YearEntryPanel, type EntryDraft, type EntryType } from './year-entry-panel';
import { YearTimeline } from './year-timeline';
import { buildChecklist, classToCompleteNext, toEntries, type StepId, type TimelineEntry } from './year-plan';

type Pending = { readonly kind: 'delete-entry'; readonly entry: TimelineEntry } | { readonly kind: 'close' | 'reopen'; readonly entry: TimelineEntry } | { readonly kind: 'current' | 'delete-year' };

/**
 * « Année scolaire »: a resumable checklist (dates, periods, holidays and exam weeks, classes, subjects)
 * and the annual calendar of each section, edited in place. The admin and the coordinators edit; only the
 * admin creates years, makes one current, deletes one, and closes or reopens periods.
 */
@Component({
  selector: 'app-school-year-page',
  imports: [ArchivedBanner, Alert, Badge, Button, EmptyState, Field, FieldControl, Icon, ConfirmModal, RouterLink, YearChecklist, YearCreateModal, YearDatesModal, YearEntryPanel, YearTimeline],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Année scolaire</h1>
        <p class="t-muted">Préparez l’année étape par étape, puis placez les périodes, les vacances et les semaines d’examens sur le calendrier.</p>
      </div>
      @if (isAdmin()) {
        <div class="page__actions">
          <a cdlsButton routerLink="/admin/nouvelle-annee"><cdls-icon name="calendar" />Passer à l’année suivante</a>
          <button cdlsButton variant="secondary" type="button" (click)="yearOpen.set(true)"><cdls-icon name="plus" />Nouvelle année</button>
        </div>
      }
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }
    @if (pageError()) {
      <cdls-alert tone="danger">{{ pageError() }}</cdls-alert>
    }

    @if (years.error() || sections.error()) {
      <cdls-alert tone="danger">{{ errorText(years.error() ?? sections.error()) }}</cdls-alert>
    } @else if (years.hasValue() && sections.hasValue()) {
      @if (year(); as current) {
        <div class="year-bar">
          <cdls-field label="Année affichée">
            <select cdlsControl (change)="pickYear($event)">
              @for (item of years.value(); track item.id) {
                <option [value]="item.id" [selected]="item.id === current.id">{{ item.label }}{{ item.isCurrent ? ' (en cours)' : '' }}</option>
              }
            </select>
          </cdls-field>
          <p class="year-bar__dates">
            {{ range(current) }}
            @if (current.isCurrent) {
              <cdls-badge tone="success">En cours</cdls-badge>
            } @else if (current.status === 'archived') {
              <cdls-badge tone="neutral">Archivée</cdls-badge>
            }
          </p>
          <div class="page__actions">
            @if (isAdmin() && !current.isCurrent) {
              @if (current.status !== 'archived') {
                <button cdlsButton variant="secondary" size="sm" type="button" (click)="startPending({ kind: 'current' })">
                  Définir comme année en cours
                </button>
              }
              <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startPending({ kind: 'delete-year' })">
                Supprimer l’année<span class="visually-hidden"> {{ current.label }}</span>
              </button>
            }
          </div>
        </div>

        @if (current.status === 'archived') {
          <div class="block"><app-archived-banner [label]="current.label" /></div>
        }

        <section class="stack stack--sm block" aria-labelledby="checklist-title">
          <h2 class="t-h2" id="checklist-title">Étapes de l’année</h2>
          @if (steps(); as list) {
            <app-year-checklist [steps]="list" (act)="onStep($event)" />
          } @else if (setupError()) {
            <cdls-alert tone="danger">{{ setupError() }}</cdls-alert>
          } @else {
            <p class="loading-line" role="status">Calcul des étapes…</p>
          }
        </section>

        <section class="stack stack--sm block" aria-labelledby="calendar-title">
          <div class="calendar-head">
            <h2 class="t-h2" id="calendar-title">Calendrier annuel</h2>
            <div class="page__actions">
              <button cdlsButton variant="secondary" size="sm" type="button" (click)="openAdd('trimester', $event)">
                <cdls-icon name="plus" />Ajouter une période
              </button>
              <button cdlsButton variant="secondary" size="sm" type="button" (click)="openAdd('holiday', $event)">
                <cdls-icon name="plus" />Ajouter des vacances
              </button>
              <button cdlsButton variant="secondary" size="sm" type="button" (click)="openAdd('exam_week', $event)">
                <cdls-icon name="plus" />Ajouter une semaine d’examens
              </button>
            </div>
          </div>

          @if (days.error()) {
            <cdls-alert tone="danger">{{ errorText(days.error()) }}</cdls-alert>
          } @else if (days.hasValue()) {
            <app-year-timeline
              [year]="current"
              [sections]="sections.value()"
              [entries]="entries()"
              [sectionOfClass]="sectionOfClass()"
              [selectedKey]="draft()?.entry?.key ?? null"
              (select)="openEdit($event.entry, $event.trigger)"
            />

            @if (classes.error()) {
              <cdls-alert tone="warning">
                Les classes n’ont pas pu être chargées : les jours réservés à certaines classes apparaissent dans toutes les filières.
              </cdls-alert>
            }

            @if (draft(); as d) {
              <app-year-entry-panel
                [draft]="d"
                [year]="current"
                [sections]="sections.value()"
                [isAdmin]="isAdmin()"
                (saved)="onEntrySaved($event)"
                (closed)="closePanel()"
                (remove)="startPending({ kind: 'delete-entry', entry: $event })"
              />
            }

            @if (entries().length) {
              <div class="table-wrap" role="region" aria-labelledby="entries-caption" tabindex="0">
                <table class="table table--stack">
                  <caption id="entries-caption" class="visually-hidden">Périodes, vacances et examens de l’année {{ current.label }}, du plus ancien au plus récent</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nom</th>
                      <th scope="col">Dates</th>
                      <th scope="col">Filière</th>
                      <th scope="col">État</th>
                      <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of entries(); track entry.key) {
                      <tr>
                        <th scope="row">
                          <span class="d-block">{{ entry.label }}</span>
                          <span class="cell-sub">{{ entry.kindLabel }}</span>
                        </th>
                        <td data-label="Dates :">{{ entryRange(entry) }}</td>
                        <td data-label="Filière :">{{ scope(entry) }}</td>
                        <td data-label="État :">
                          @if (entry.source === 'period') {
                            @if (entry.locked) {
                              <cdls-badge tone="neutral">Clôturée, verrouillée</cdls-badge>
                            } @else {
                              <cdls-badge tone="info">Ouverte</cdls-badge>
                            }
                          } @else {
                            <span class="t-muted">—</span>
                          }
                        </td>
                        <td class="num">
                          <span class="row-actions">
                            @if (!entry.locked) {
                              <button cdlsButton variant="tertiary" size="sm" type="button" (click)="openEdit(entry, $event)">
                                Modifier<span class="visually-hidden"> {{ entry.label }}</span>
                              </button>
                            }
                            @if (isAdmin() && entry.source === 'period') {
                              @if (entry.locked) {
                                <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startPending({ kind: 'reopen', entry })">
                                  Rouvrir<span class="visually-hidden"> {{ entry.label }}</span>
                                </button>
                              } @else {
                                <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startPending({ kind: 'close', entry })">
                                  Clôturer<span class="visually-hidden"> {{ entry.label }}</span>
                                </button>
                              }
                            }
                            @if (!entry.locked) {
                              <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startPending({ kind: 'delete-entry', entry })">
                                Supprimer<span class="visually-hidden"> {{ entry.label }}</span>
                              </button>
                            }
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <cdls-empty-state icon="calendar" title="Le calendrier est vide" description="Commencez par les périodes de l’année, puis ajoutez les vacances et les semaines d’examens." />
            }
          } @else {
            <p class="loading-line" role="status">Chargement du calendrier…</p>
          }
        </section>
      } @else {
        <cdls-empty-state icon="calendar" title="Aucune année scolaire" description="Créez la première année pour commencer à préparer le calendrier.">
          @if (isAdmin()) {
            <button cdlsButton variant="secondary" type="button" (click)="yearOpen.set(true)">Nouvelle année</button>
          }
        </cdls-empty-state>
      }
    } @else {
      <p class="loading-line" role="status">Chargement de l’année…</p>
    }

    <app-year-create-modal [(open)]="yearOpen" (created)="onYearCreated($event)" />
    <app-year-dates-modal [(open)]="datesOpen" [year]="year() ?? null" (saved)="onYearSaved($event)" />

    <app-confirm-modal
      [title]="confirmTitle()"
      [confirmLabel]="confirmLabel()"
      [danger]="confirmDanger()"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="confirmOpen"
      [restoreFocus]="!leaving()"
      (closed)="afterConfirmClosed()"
      (confirmed)="runPending()"
    >
      @switch (pending()?.kind) {
        @case ('current') {
          <p>
            <strong>{{ year()?.label }}</strong> devient l’année en cours pour tout le collège : classes, inscriptions et espaces des élèves et
            des enseignants suivent ce changement.
          </p>
        }
        @case ('delete-year') {
          <p>L’année <strong>{{ year()?.label }}</strong>, ses périodes et ses jours de calendrier seront supprimés.</p>
          <p class="t-body-s t-muted">Seule une année sans classe, qui n’est pas l’année en cours, peut être supprimée.</p>
        }
        @case ('close') {
          <p>
            La clôture de <strong>{{ pendingEntry()?.label }}</strong> verrouille ses notes : ce sont elles qui servent à calculer les bulletins.
            Elle ne pourra plus être modifiée.
          </p>
          <p>Clôturez seulement quand tous les enseignants ont saisi et publié leurs notes.</p>
        }
        @case ('reopen') {
          <p><strong>{{ pendingEntry()?.label }}</strong> sera de nouveau modifiable, ainsi que ses notes.</p>
          <p class="t-body-s t-muted">C’est refusé si des bulletins de cette période sont déjà publiés.</p>
        }
        @case ('delete-entry') {
          <p><strong>{{ pendingEntry()?.label }}</strong> ({{ pendingEntry()?.kindLabel?.toLowerCase() }}) sera supprimé du calendrier.</p>
          @if (pendingEntry()?.source === 'period') {
            <p class="t-body-s t-muted">Seule une période sans note ni bulletin peut être supprimée.</p>
          }
        }
      }
    </app-confirm-modal>
  `,
  styles: `
    .block {
      margin-top: var(--space-8);
    }
    .year-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: var(--space-4) var(--space-6);
    }
    .year-bar .field {
      min-width: 14rem;
    }
    .year-bar__dates {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.75rem;
    }
    .calendar-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
    }
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-1);
    }
  `,
})
export class SchoolYearPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #router = inject(Router);
  readonly #document = inject(DOCUMENT);

  protected readonly isAdmin = computed(() => this.#auth.role() === 'admin');

  protected readonly years = resource({ loader: () => this.#api.school.years() });
  protected readonly sections = resource({ loader: () => this.#api.school.sections() });
  protected readonly yearId = signal<string | null>(null);
  protected readonly year = computed<SchoolYearDto | undefined>(() => {
    if (!this.years.hasValue()) return undefined;
    const list = this.years.value();
    return list.find((y) => y.id === this.yearId()) ?? list.find((y) => y.isCurrent) ?? list[0];
  });

  protected readonly days = resource({
    params: () => this.year()?.id,
    loader: ({ params }) => this.#api.school.calendarDays({ schoolYearId: params }),
  });
  protected readonly classes = resource({
    params: () => this.year()?.id,
    loader: ({ params }) => this.#api.school.classes({ schoolYearId: params }),
  });
  protected readonly counts = resource({
    params: () => (this.classes.hasValue() ? this.classes.value() : undefined),
    loader: async ({ params }) => {
      const entries = await Promise.all(params.map(async (c) => [c.id, (await this.#api.school.classSubjects(c.id)).length] as const));
      return new Map(entries);
    },
  });

  protected readonly entries = computed(() => {
    const year = this.year();
    return year && this.days.hasValue() ? toEntries(year.periods, this.days.value()) : [];
  });
  protected readonly sectionOfClass = computed<ReadonlyMap<string, string>>(
    () => new Map((this.classes.hasValue() ? this.classes.value() : []).map((c) => [c.id, c.sectionId])),
  );
  protected readonly steps = computed(() => {
    const year = this.year();
    if (!year || !this.sections.hasValue() || !this.days.hasValue() || !this.classes.hasValue() || !this.counts.hasValue()) return null;
    return buildChecklist({ year, sections: this.sections.value(), days: this.days.value(), classes: this.classes.value(), subjectCounts: this.counts.value() });
  });
  protected readonly setupError = computed(() =>
    this.classes.error() || this.counts.error() ? 'Impossible de calculer les étapes. Rechargez la page dans un instant.' : null,
  );

  protected readonly yearOpen = signal(false);
  protected readonly datesOpen = signal(false);
  protected readonly draft = signal<EntryDraft | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly pending = signal<Pending | null>(null);
  protected readonly leaving = signal(false);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly pageError = signal<string | null>(null);

  protected readonly pendingEntry = computed(() => {
    const p = this.pending();
    return p && 'entry' in p ? p.entry : null;
  });
  protected readonly confirmTitle = computed(() => {
    switch (this.pending()?.kind) {
      case 'current':
        return 'Changer d’année en cours ?';
      case 'delete-year':
        return 'Supprimer cette année ?';
      case 'close':
        return 'Clôturer cette période ?';
      case 'reopen':
        return 'Rouvrir cette période ?';
      default:
        return 'Supprimer du calendrier ?';
    }
  });
  protected readonly confirmLabel = computed(() => {
    switch (this.pending()?.kind) {
      case 'current':
        return 'Définir comme année en cours';
      case 'delete-year':
        return 'Supprimer l’année';
      case 'close':
        return 'Clôturer la période';
      case 'reopen':
        return 'Rouvrir la période';
      default:
        return 'Supprimer';
    }
  });
  protected readonly confirmDanger = computed(() => ['delete-year', 'close', 'delete-entry'].includes(this.pending()?.kind ?? ''));

  /** The control that opened the form: focus returns to it when the form closes. */
  #opener: HTMLElement | null = null;

  protected range(year: SchoolYearDto): string {
    const text = formatRange(year.startsOn, year.endsOn);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  protected entryRange(entry: TimelineEntry): string {
    return entry.startsOn === entry.endsOn ? formatDay(entry.startsOn) : formatRange(entry.startsOn, entry.endsOn);
  }

  protected scope(entry: TimelineEntry): string {
    if (entry.classIds.length) return `${entry.classIds.length} classe${entry.classIds.length > 1 ? 's' : ''}`;
    if (entry.sectionId === null) return 'Toute l’école';
    return this.sections.hasValue() ? (this.sections.value().find((s) => s.id === entry.sectionId)?.label ?? '—') : '—';
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger l’année scolaire. Réessayez dans un instant.');
  }

  protected pickYear(event: Event): void {
    this.yearId.set((event.target as HTMLSelectElement).value);
    this.draft.set(null);
  }

  protected onStep(step: StepId): void {
    switch (step) {
      case 'dates':
        this.datesOpen.set(true);
        break;
      case 'periods':
        this.openAdd('trimester');
        break;
      case 'closures':
        this.openAdd('holiday');
        break;
      case 'classes':
        void this.#router.navigate(['/admin/classes'], { queryParams: { annee: this.year()?.id } });
        break;
      case 'subjects': {
        const target = classToCompleteNext(this.classes.hasValue() ? this.classes.value() : [], this.counts.hasValue() ? this.counts.value() : new Map());
        void this.#router.navigate(target ? ['/admin/classes', target.id] : ['/admin/classes'], target ? { queryParams: { onglet: 'matieres' } } : {});
        break;
      }
    }
  }

  protected openAdd(type: EntryType, source?: Event | HTMLElement): void {
    this.#remember(source);
    this.notice.set(null);
    this.draft.set({ entry: null, type });
  }

  protected openEdit(entry: TimelineEntry, source?: Event | HTMLElement): void {
    this.#remember(source);
    this.notice.set(null);
    this.draft.set({ entry, type: entry.type });
  }

  #remember(source?: Event | HTMLElement): void {
    const target = source instanceof Event ? source.target : (source ?? this.#document.activeElement);
    if (target instanceof HTMLElement) this.#opener = target.closest('button') ?? target;
  }

  protected closePanel(): void {
    this.draft.set(null);
    const opener = this.#opener;
    this.#opener = null;
    if (opener?.isConnected) queueMicrotask(() => opener.focus());
  }

  protected onEntrySaved(message: string): void {
    this.notice.set(message);
    this.closePanel();
    this.#refresh();
  }

  protected onYearCreated(year: SchoolYearDto): void {
    this.notice.set(`Année ${year.label} créée. Ajoutez-lui ses périodes.`);
    this.yearId.set(year.id);
    this.years.reload();
  }

  protected onYearSaved(year: SchoolYearDto): void {
    this.notice.set(`Les dates de l’année ${year.label} sont enregistrées.`);
    this.#refresh();
  }

  /** After a confirmed action that removed the opener, focus goes to the page heading. */
  protected afterConfirmClosed(): void {
    if (!this.leaving()) return;
    this.leaving.set(false);
    focusPageHeading(this.#document);
  }

  protected startPending(pending: Pending): void {
    this.pending.set(pending);
    this.actionError.set(null);
    this.confirmOpen.set(true);
  }

  protected async runPending(): Promise<void> {
    const pending = this.pending();
    const year = this.year();
    if (!pending || !year) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      switch (pending.kind) {
        case 'current':
          await this.#api.school.setCurrentYear(year.id);
          this.notice.set(`${year.label} est désormais l’année en cours.`);
          break;
        case 'delete-year':
          await this.#api.school.deleteYear(year.id);
          this.yearId.set(null);
          this.notice.set(`Année ${year.label} supprimée.`);
          break;
        case 'close':
          await this.#api.school.closeTerm(pending.entry.id);
          this.notice.set(`${pending.entry.label} est clôturée : vous pouvez générer ses bulletins.`);
          break;
        case 'reopen':
          await this.#api.school.reopenTerm(pending.entry.id);
          this.notice.set(`${pending.entry.label} est rouverte.`);
          break;
        case 'delete-entry':
          if (pending.entry.source === 'period') await this.#api.school.deleteTerm(pending.entry.id);
          else await this.#api.school.deleteCalendarDay(pending.entry.id);
          this.notice.set(`« ${pending.entry.label} » est supprimé du calendrier.`);
          if (this.draft()?.entry?.key === pending.entry.key) this.draft.set(null);
          break;
      }
      this.pageError.set(null);
      this.leaving.set(true);
      this.confirmOpen.set(false);
      this.#refresh();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  #refresh(): void {
    this.years.reload();
    this.days.reload();
  }
}
