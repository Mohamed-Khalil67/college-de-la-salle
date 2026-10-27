import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { SECTION_CHANGE_LIMITS, type ClassDto, type SectionChangeRequestDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../../shared/ui';
import { fullName, sectionLabel, sectionMove } from '../shared/admin-format';
import { shownError } from '../../../shared/utils/forms';

export type Decision = 'approve' | 'reject';

interface DecisionModel {
  classId: string;
  note: string;
}

/**
 * Approves or rejects one section-change request. Approving asks for the class of the new section: the
 * move (old enrolment closed, new one opened, section set, audit row) is one step on the server.
 */
@Component({
  selector: 'app-decision-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal [title]="title()" [(open)]="open">
      @if (request(); as item) {
        <form class="stack" novalidate (submit)="onSubmit($event)">
          <p>
            <strong>{{ name() }}</strong> : {{ move() }}.
          </p>
          <blockquote class="reason">« {{ item.reason }} »</blockquote>
          @if (decision() === 'approve') {
            <cdls-field
              label="Classe d’arrivée"
              [helper]="'Classes de ' + toLabel() + ' pour l’année en cours. L’élève quitte ' + (item.currentClassLabel ?? 'sa classe') + '.'"
              [error]="classError()"
            >
              <select cdlsControl [formField]="decisionForm.classId">
                <option value="">Choisir une classe</option>
                @for (c of targetClasses(); track c.id) {
                  <option [value]="c.id">{{ c.label }}</option>
                }
              </select>
            </cdls-field>
            <p class="t-body-s t-muted">Ses notes, absences et bulletins sont conservés. La décision est enregistrée dans le journal.</p>
          }
          <cdls-field
            [label]="decision() === 'approve' ? 'Message à l’élève (facultatif)' : 'Raison du refus'"
            [helper]="decision() === 'approve' ? '' : 'L’élève la verra dans sa demande.'"
            [error]="noteError()"
          >
            <textarea cdlsControl rows="3" [formField]="decisionForm.note"></textarea>
          </cdls-field>
          @if (failure()) {
            <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
          }
          <div class="modal__footer">
            <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
            <button cdlsButton [variant]="decision() === 'approve' ? 'primary' : 'danger'" type="submit" [disabled]="busy()">
              {{ busy() ? 'Un instant…' : decision() === 'approve' ? 'Approuver et déplacer l’élève' : 'Refuser la demande' }}
            </button>
          </div>
        </form>
      }
    </cdls-modal>
  `,
  styles: `
    .reason {
      margin: 0;
      padding-inline-start: var(--space-4);
      border-inline-start: 3px solid var(--color-line);
      color: var(--color-muted);
    }
  `,
})
export class DecisionModal {
  readonly open = model(false);
  readonly request = input<SectionChangeRequestDto | null>(null);
  readonly decision = input<Decision>('approve');
  readonly classes = input<readonly ClassDto[]>([]);
  readonly decided = output<SectionChangeRequestDto>();
  /** The request was decided or changed elsewhere (409): the list should be fetched again. */
  readonly stale = output<void>();

  readonly #api = inject(ApiClient);

  protected readonly title = computed(() => (this.decision() === 'approve' ? 'Approuver le changement de section' : 'Refuser le changement de section'));
  protected readonly name = computed(() => {
    const r = this.request();
    return r ? fullName({ firstName: r.studentFirstName, lastName: r.studentLastName }) : '';
  });
  protected readonly move = computed(() => {
    const r = this.request();
    return r ? sectionMove(r.fromSection, r.toSection) : '';
  });
  protected readonly toLabel = computed(() => {
    const r = this.request();
    return r ? sectionLabel(r.toSection) : '';
  });
  protected readonly targetClasses = computed(() => {
    const r = this.request();
    return r ? this.classes().filter((c) => c.sectionCode === r.toSection) : [];
  });

  protected readonly model = signal<DecisionModel>({ classId: '', note: '' });
  protected readonly decisionForm = form(this.model, (p) => {
    required(p.classId, { message: 'Choisissez la classe d’arrivée de l’élève.', when: () => this.decision() === 'approve' });
    required(p.note, { message: 'Indiquez la raison du refus : l’élève la lira.', when: () => this.decision() === 'reject' });
    maxLength(p.note, SECTION_CHANGE_LIMITS.note, { message: 'Le message est trop long : 1 000 caractères au plus.' });
  });
  protected readonly classError = computed(() => shownError(this.decisionForm.classId()));
  protected readonly noteError = computed(() => shownError(this.decisionForm.note()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.failure.set(null);
        this.decisionForm().reset({ classId: '', note: '' });
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const item = this.request();
    if (!item) return;
    void submit(this.decisionForm, async () => {
      const { classId, note } = this.model();
      this.busy.set(true);
      this.failure.set(null);
      try {
        const done =
          this.decision() === 'approve'
            ? await this.#api.sectionChanges.approve(item.id, { classId, ...(note.trim() ? { note: note.trim() } : {}) })
            : await this.#api.sectionChanges.reject(item.id, { note: note.trim() });
        this.decided.emit(done);
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
        if ((error as { status?: number }).status === 409) this.stale.emit();
      } finally {
        this.busy.set(false);
      }
    });
  }
}
