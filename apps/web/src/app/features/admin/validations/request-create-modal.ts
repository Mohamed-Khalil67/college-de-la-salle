import { Component, computed, effect, inject, model, output, resource, signal, untracked } from '@angular/core';
import { debounce, form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { SECTION_CHANGE_LIMITS, type SectionChangeRequestDto, type SectionId, type UserDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../../shared/ui';
import { fullName, sectionLabel } from '../shared/admin-format';
import { shownError } from '../../../shared/utils/forms';

interface RequestModel {
  search: string;
  studentId: string;
  reason: string;
}

/** The secretariat opens a section-change request for a student (found by name or e-mail). */
@Component({
  selector: 'app-request-create-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal title="Nouvelle demande de changement de section" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <cdls-field label="Rechercher l’élève" helper="Tapez au moins 2 lettres du nom, du prénom ou de l’adresse e-mail.">
          <input cdlsControl type="search" autocomplete="off" [formField]="requestForm.search" />
        </cdls-field>
        <div role="status" class="t-body-s t-muted">{{ resultsText() }}</div>
        <cdls-field label="Élève" [error]="studentError()">
          <select cdlsControl [formField]="requestForm.studentId">
            <option value="">Choisir un élève</option>
            @for (s of options(); track s.id) {
              <option [value]="s.studentId">{{ label(s) }}</option>
            }
          </select>
        </cdls-field>
        @if (target()) {
          <p>Passage demandé : <strong>{{ target() }}</strong>.</p>
        }
        <cdls-field label="Raison" helper="Pourquoi l’élève change de section." [error]="reasonError()">
          <textarea cdlsControl rows="3" [formField]="requestForm.reason"></textarea>
        </cdls-field>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Envoi…' : 'Ouvrir la demande' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class RequestCreateModal {
  readonly open = model(false);
  readonly created = output<SectionChangeRequestDto>();

  readonly #api = inject(ApiClient);

  protected readonly model = signal<RequestModel>({ search: '', studentId: '', reason: '' });
  protected readonly requestForm = form(this.model, (p) => {
    debounce(p.search, 300);
    required(p.studentId, { message: 'Choisissez l’élève concerné.' });
    required(p.reason, { message: 'Indiquez la raison de la demande.' });
    maxLength(p.reason, SECTION_CHANGE_LIMITS.reason, { message: 'Le message est trop long : 1 000 caractères au plus.' });
  });
  protected readonly studentError = computed(() => shownError(this.requestForm.studentId()));
  protected readonly reasonError = computed(() => shownError(this.requestForm.reason()));

  readonly #term = computed(() => this.model().search.trim());
  protected readonly found = resource({
    params: () => (this.open() && this.#term().length >= 2 ? this.#term() : undefined),
    loader: ({ params }) => this.#api.users.list({ role: 'student', status: 'active', search: params, pageSize: 20 }),
  });
  protected readonly candidates = computed<readonly UserDto[]>(() =>
    this.found.hasValue() ? this.found.value().items.filter((u) => !!u.studentId && !!u.sectionCode) : [],
  );
  /** Every student seen in the results of this dialog: the chosen one stays valid when the search changes. */
  readonly #seen = signal<ReadonlyMap<string, UserDto>>(new Map());
  protected readonly options = computed<readonly UserDto[]>(() => {
    const chosen = this.#seen().get(this.model().studentId);
    const list = this.candidates();
    return chosen && !list.some((u) => u.studentId === chosen.studentId) ? [chosen, ...list] : list;
  });
  protected readonly resultsText = computed(() => {
    if (this.#term().length < 2) return '';
    if (this.found.isLoading()) return 'Recherche en cours…';
    const n = this.candidates().length;
    return n ? `${n} élève${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}.` : 'Aucun élève trouvé.';
  });
  protected readonly target = computed(() => {
    const chosen = this.#seen().get(this.model().studentId);
    return chosen?.sectionCode ? sectionLabel(otherSection(chosen.sectionCode)) : '';
  });

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      const list = this.candidates();
      if (!list.length) return;
      untracked(() => this.#seen.update((seen) => new Map([...seen, ...list.map((u) => [u.studentId!, u] as const)])));
    });
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.#seen.set(new Map());
        this.failure.set(null);
        this.requestForm().reset({ search: '', studentId: '', reason: '' });
      });
    });
  }

  protected label(user: UserDto): string {
    return `${fullName(user)} (${user.email}), ${sectionLabel(user.sectionCode!)}`;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.requestForm, async () => {
      const chosen = this.#seen().get(this.model().studentId);
      if (!chosen?.sectionCode) {
        this.failure.set('Choisissez l’élève dans la liste des résultats.');
        return;
      }
      this.busy.set(true);
      this.failure.set(null);
      try {
        const request = await this.#api.sectionChanges.create({
          studentId: chosen.studentId!,
          toSection: otherSection(chosen.sectionCode),
          reason: this.model().reason.trim(),
        });
        this.created.emit(request);
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}

function otherSection(code: SectionId): SectionId {
  return code === 'bac' ? 'nationale' : 'bac';
}
