import { Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { SECTION_CHANGE_STATUSES, type ClassDto, type Paginated, type SectionChangeRequestDto, type SectionChangeStatus } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Badge, type BadgeTone, Button, EmptyState, Icon, Pagination, Tabs } from '../../ui';
import { formatDay, fullName, sectionMove } from '../shared/admin-format';
import { type Decision, DecisionModal } from './decision-modal';
import { RequestCreateModal } from './request-create-modal';

const PAGE_SIZE = 20;

const TABS: readonly { id: SectionChangeStatus; label: string }[] = [
  { id: 'pending', label: 'En attente' },
  { id: 'approved', label: 'Approuvées' },
  { id: 'rejected', label: 'Refusées' },
];

const STATUS: Readonly<Record<SectionChangeStatus, { label: string; tone: BadgeTone }>> = {
  pending: { label: 'En attente', tone: 'info' },
  approved: { label: 'Approuvée', tone: 'success' },
  rejected: { label: 'Refusée', tone: 'neutral' },
};

function isStatus(value: string): value is SectionChangeStatus {
  return (SECTION_CHANGE_STATUSES as readonly string[]).includes(value);
}

/** « Validations »: section-change requests from students and the secretariat, approved or rejected here. */
@Component({
  selector: 'app-validations-page',
  imports: [Alert, Badge, Button, EmptyState, Icon, Pagination, Tabs, DecisionModal, RequestCreateModal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Validations</h1>
        <p class="t-muted">Demandes de changement de section : l’approbation déplace l’élève dans la classe choisie.</p>
      </div>
      <div class="page__actions">
        <button cdlsButton type="button" (click)="createOpen.set(true)"><cdls-icon name="plus" />Nouvelle demande</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    <cdls-tabs [tabs]="tabs()" label="Statut des demandes" [(value)]="tab">
      @if (requests.error()) {
        <cdls-alert tone="danger">{{ errorText(requests.error()) }}</cdls-alert>
      } @else if (shown(); as list) {
        @if (list.items.length) {
          <div [attr.aria-busy]="requests.isLoading()">
            <div class="table-wrap" role="region" aria-labelledby="validations-caption" tabindex="0">
              <table class="table table--stack">
                <caption id="validations-caption" class="visually-hidden">{{ caption() }}</caption>
                <thead>
                  <tr>
                    <th scope="col">Élève</th>
                    <th scope="col">Demande</th>
                    <th scope="col">Raison</th>
                    <th scope="col">Statut</th>
                    <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of list.items; track item.id) {
                    <tr>
                      <th scope="row">
                        <span class="d-block">{{ name(item) }}</span>
                        <span class="cell-sub">{{ item.currentClassLabel ?? 'Sans classe' }}</span>
                      </th>
                      <td data-label="Demande :">
                        {{ move(item) }}
                        <span class="cell-sub d-block">{{ origin(item) }}</span>
                      </td>
                      <td data-label="Raison :">{{ item.reason }}</td>
                      <td data-label="Statut :">
                        <cdls-badge [tone]="status[item.status].tone">{{ status[item.status].label }}</cdls-badge>
                        @if (item.decidedAt) {
                          <span class="cell-sub d-block">
                            {{ item.decidedByName }}, le {{ day(item.decidedAt) }}
                            @if (item.newClassLabel) { : {{ item.newClassLabel }} }
                            @if (item.decisionNote) { <br />« {{ item.decisionNote }} » }
                          </span>
                        }
                      </td>
                      <td class="num">
                        @if (item.status === 'pending') {
                          <span class="row-actions">
                            <button cdlsButton variant="secondary" size="sm" type="button" (click)="startDecision(item, 'approve')">
                              Approuver<span class="visually-hidden"> la demande de {{ name(item) }}</span>
                            </button>
                            <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startDecision(item, 'reject')">
                              Refuser<span class="visually-hidden"> la demande de {{ name(item) }}</span>
                            </button>
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <cdls-pagination [total]="list.total" [pageSize]="pageSize" noun="demandes" label="Pagination des demandes" [(page)]="page" />
          </div>
        } @else {
          <cdls-empty-state
            icon="check"
            [title]="emptyTitle()"
            description="Les demandes des élèves et du secrétariat apparaîtront ici."
          />
        }
      } @else {
        <p class="loading-line" role="status">Chargement des demandes…</p>
      }
    </cdls-tabs>

    <app-decision-modal
      [(open)]="decisionOpen"
      [request]="current()"
      [decision]="decision()"
      [classes]="classList()"
      (decided)="onDecided($event)"
    />
    <app-request-create-modal [(open)]="createOpen" (created)="onCreated()" />
  `,
  styles: `
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-1);
    }
  `,
})
export class ValidationsPage {
  readonly #api = inject(ApiClient);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly status = STATUS;
  protected readonly tab = signal<string>('pending');
  protected readonly statusFilter = computed<SectionChangeStatus>(() => {
    const tab = this.tab();
    return isStatus(tab) ? tab : 'pending';
  });
  protected readonly page = linkedSignal({ source: () => this.statusFilter(), computation: () => 1 });

  protected readonly requests = resource({
    params: () => ({ status: this.statusFilter(), page: this.page() }),
    loader: ({ params }) => this.#api.sectionChanges.list({ ...params, pageSize: PAGE_SIZE }),
  });
  /** The last page received, kept on screen while the next one loads. */
  protected readonly shown = linkedSignal<Paginated<SectionChangeRequestDto> | undefined, Paginated<SectionChangeRequestDto> | undefined>({
    source: () => (this.requests.hasValue() ? this.requests.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });
  protected readonly pendingCount = resource({
    loader: async () => (await this.#api.sectionChanges.list({ status: 'pending', pageSize: 1 })).total,
  });
  protected readonly tabs = computed(() =>
    TABS.map((t) => ({ ...t, count: t.id === 'pending' && this.pendingCount.hasValue() ? this.pendingCount.value() : null })),
  );
  protected readonly classes = resource({ loader: () => this.#api.school.classes() });
  protected readonly classList = computed<readonly ClassDto[]>(() => (this.classes.hasValue() ? this.classes.value() : []));

  protected readonly caption = computed(() => `Demandes de changement de section, ${TABS.find((t) => t.id === this.statusFilter())?.label.toLowerCase()}`);
  protected readonly emptyTitle = computed(() => (this.statusFilter() === 'pending' ? 'Aucune demande en attente' : 'Aucune demande'));

  protected readonly decisionOpen = signal(false);
  protected readonly createOpen = signal(false);
  protected readonly current = signal<SectionChangeRequestDto | null>(null);
  protected readonly decision = signal<Decision>('approve');
  protected readonly notice = signal<string | null>(null);

  protected name(item: SectionChangeRequestDto): string {
    return fullName({ firstName: item.studentFirstName, lastName: item.studentLastName });
  }

  protected move(item: SectionChangeRequestDto): string {
    return sectionMove(item.fromSection, item.toSection);
  }

  protected origin(item: SectionChangeRequestDto): string {
    return `${item.requestedByStudent ? 'Demandée par l’élève' : `Saisie par ${item.requestedByName}`}, le ${this.day(item.createdAt)}`;
  }

  protected day(iso: string): string {
    return formatDay(iso.slice(0, 10));
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les demandes. Réessayez dans un instant.');
  }

  protected startDecision(item: SectionChangeRequestDto, decision: Decision): void {
    this.current.set(item);
    this.decision.set(decision);
    this.decisionOpen.set(true);
  }

  protected onDecided(done: SectionChangeRequestDto): void {
    const who = this.name(done);
    this.notice.set(
      done.status === 'approved'
        ? `${who} est maintenant en ${done.newClassLabel}.`
        : `La demande de ${who} est refusée.`,
    );
    this.reload();
  }

  protected onCreated(): void {
    this.notice.set('La demande est ouverte : elle attend votre décision.');
    this.tab.set('pending');
    this.reload();
  }

  private reload(): void {
    this.requests.reload();
    this.pendingCount.reload();
  }
}
