import { Component, computed, inject, resource, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { SECTION_CHANGE_LIMITS, SECTION_LABELS, type SectionChangeStatus, type SectionId } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';
import { Alert, Badge, type BadgeTone, Button, EmptyState, Field, FieldControl } from '../../ui';
import { LoadState } from '../shared/load-state';

const STATUS: Readonly<Record<SectionChangeStatus, { label: string; tone: BadgeTone }>> = {
  pending: { label: 'En attente', tone: 'info' },
  approved: { label: 'Acceptée', tone: 'success' },
  rejected: { label: 'Refusée', tone: 'neutral' },
};

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' });

/** « Ma section »: the registered section and class, and a request to change section (decided by the administration). */
@Component({
  selector: 'app-section-page',
  imports: [FormField, Alert, Badge, Button, EmptyState, Field, FieldControl, LoadState],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Ma section</h1>
        <p class="t-muted">Changer de section se décide avec l’administration du collège.</p>
      </div>
    </div>

    <dl class="registered">
      <div>
        <dt class="t-muted">Section</dt>
        <dd class="t-h3">{{ sectionName() }}</dd>
      </div>
      <div>
        <dt class="t-muted">Classe</dt>
        <dd class="t-h3">{{ auth.user()?.classLabel ?? 'Non renseignée' }}</dd>
      </div>
    </dl>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    <app-load-state [ref]="requests" label="Chargement de vos demandes…" />

    @if (requests.hasValue()) {
      @if (pending(); as current) {
        <section class="stack stack--sm" aria-labelledby="pending-title">
          <h2 class="t-h2" id="pending-title">Demande en cours</h2>
          <cdls-alert tone="info">
            Votre demande de passage en <strong>{{ labelOf(current.toSection) }}</strong> est en attente depuis le
            {{ day(current.createdAt) }}. L’administration vous répondra : vous ne pouvez pas en envoyer une autre d’ici là.
          </cdls-alert>
        </section>
      } @else if (target()) {
        <section class="stack" aria-labelledby="new-title">
          <h2 class="t-h2" id="new-title">Demander {{ otherLabel() }}</h2>
          <form class="stack" novalidate (submit)="onSubmit($event)">
            <cdls-field
              label="Pourquoi souhaitez-vous changer de section ?"
              helper="Quelques phrases suffisent : orientation, projet d’études, déménagement…"
              [error]="reasonError()"
            >
              <textarea cdlsControl rows="4" [formField]="requestForm.reason"></textarea>
            </cdls-field>
            @if (failure()) {
              <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
            }
            <div>
              <button cdlsButton type="submit" [disabled]="busy()">
                {{ busy() ? 'Envoi…' : 'Envoyer la demande à l’administration' }}
              </button>
            </div>
          </form>
        </section>
      } @else {
        <cdls-alert tone="warning">
          Votre section n’est pas encore enregistrée : contactez le secrétariat pour la renseigner.
        </cdls-alert>
      }

      <section class="stack stack--sm" aria-labelledby="history-title">
        <h2 class="t-h2" id="history-title">Mes demandes</h2>
        @if (requests.value().length) {
          <div class="table-wrap" role="region" aria-labelledby="history-caption" tabindex="0">
            <table class="table table--stack">
              <caption id="history-caption" class="visually-hidden">Mes demandes de changement de section, de la plus récente à la plus ancienne</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Demande</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Réponse</th>
                </tr>
              </thead>
              <tbody>
                @for (item of requests.value(); track item.id) {
                  <tr>
                    <th scope="row">{{ day(item.createdAt) }}</th>
                    <td data-label="Demande :">{{ labelOf(item.fromSection) }} → {{ labelOf(item.toSection) }}</td>
                    <td data-label="Statut :"><cdls-badge [tone]="status[item.status].tone">{{ status[item.status].label }}</cdls-badge></td>
                    <td data-label="Réponse :">
                      @if (item.status === 'approved') {
                        Vous êtes en {{ item.newClassLabel }}. {{ item.decisionNote }}
                      } @else {
                        {{ item.decisionNote || '—' }}
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <cdls-empty-state icon="file-text" title="Aucune demande" description="Vos demandes de changement de section apparaîtront ici." />
        }
      </section>
    }
  `,
  styles: `
    .registered {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      margin-bottom: var(--space-6);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-subtle);
    }
    @media (min-width: 40rem) {
      .registered {
        grid-template-columns: 1fr 1fr;
      }
    }
    section {
      margin-top: var(--space-8);
    }
  `,
})
export class SectionPage {
  protected readonly auth = inject(AuthStore);
  readonly #api = inject(ApiClient);

  protected readonly status = STATUS;
  protected readonly requests = resource({ loader: () => this.#api.sectionChanges.mine() });
  protected readonly pending = computed(() => (this.requests.hasValue() ? this.requests.value().find((r) => r.status === 'pending') : undefined));

  protected readonly sectionName = computed(() => {
    const code = this.auth.user()?.sectionCode;
    return code ? SECTION_LABELS[code] : 'Non renseignée';
  });
  /** The other section: a student has two to choose from. */
  protected readonly target = computed<SectionId | null>(() => {
    const code = this.auth.user()?.sectionCode;
    return code ? (code === 'bac' ? 'nationale' : 'bac') : null;
  });
  protected readonly otherLabel = computed(() => {
    const code = this.target();
    return code ? `le passage en ${SECTION_LABELS[code]}` : '';
  });

  protected readonly model = signal({ reason: '' });
  protected readonly requestForm = form(this.model, (p) => {
    required(p.reason, { message: 'Expliquez en quelques mots la raison de votre demande.' });
    maxLength(p.reason, SECTION_CHANGE_LIMITS.reason, { message: 'Votre message est trop long : 1 000 caractères au plus.' });
  });
  protected readonly reasonError = computed(() => {
    const state = this.requestForm.reason();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  });

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    // The section and class of the session come from sign-in: an approved request changes them, so
    // read the profile again when the page opens.
    void this.auth.reloadUser();
  }

  protected labelOf(code: SectionId): string {
    return SECTION_LABELS[code];
  }

  protected day(iso: string): string {
    return DAY.format(new Date(iso));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const toSection = this.target();
    if (!toSection) return;
    void submit(this.requestForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        await this.#api.sectionChanges.create({ toSection, reason: this.model().reason.trim() });
        this.notice.set('Votre demande est envoyée à l’administration.');
        this.requestForm().reset({ reason: '' });
        this.requests.reload();
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
