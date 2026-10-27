import { Component, computed, effect, inject, model, output, signal, untracked } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import type { SchoolYearDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../../shared/ui';
import { isYearLabel } from '../shared/admin-format';
import { shownError } from '../../../shared/utils/forms';

interface YearModel {
  label: string;
  startsOn: string;
  endsOn: string;
}

/** Creates a school year (not current until an admin says so). */
@Component({
  selector: 'app-year-create-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal title="Nouvelle année scolaire" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <cdls-field label="Année" helper="Deux années qui se suivent, par exemple 2027-2028." [error]="labelError()">
          <input cdlsControl autocomplete="off" [formField]="yearForm.label" />
        </cdls-field>
        <cdls-field label="Début" [error]="startError()">
          <input cdlsControl type="date" [formField]="yearForm.startsOn" />
        </cdls-field>
        <cdls-field label="Fin" [error]="endError()">
          <input cdlsControl type="date" [formField]="yearForm.endsOn" />
        </cdls-field>
        <p class="t-body-s t-muted">L’année n’est pas « en cours » tant que vous ne l’avez pas définie comme telle.</p>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Création…' : 'Créer l’année' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class YearCreateModal {
  readonly open = model(false);
  readonly created = output<SchoolYearDto>();

  readonly #api = inject(ApiClient);

  protected readonly model = signal<YearModel>({ label: '', startsOn: '', endsOn: '' });
  protected readonly yearForm = form(this.model, (p) => {
    required(p.label, { message: 'Saisissez l’année, par exemple 2027-2028.' });
    validate(p.label, ({ value }) =>
      value() && !isYearLabel(value().trim())
        ? { kind: 'yearLabel', message: 'Écrivez deux années qui se suivent, par exemple 2027-2028.' }
        : null,
    );
    required(p.startsOn, { message: 'Choisissez la date de rentrée.' });
    required(p.endsOn, { message: 'Choisissez la date de fin d’année.' });
    validate(p.endsOn, ({ value, valueOf }) =>
      value() && valueOf(p.startsOn) && value() <= valueOf(p.startsOn)
        ? { kind: 'order', message: 'La fin doit venir après le début.' }
        : null,
    );
  });
  protected readonly labelError = computed(() => shownError(this.yearForm.label()));
  protected readonly startError = computed(() => shownError(this.yearForm.startsOn()));
  protected readonly endError = computed(() => shownError(this.yearForm.endsOn()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.failure.set(null);
        this.yearForm().reset({ label: '', startsOn: '', endsOn: '' });
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.yearForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const year = await this.#api.school.createYear({ ...this.model(), label: this.model().label.trim() });
        this.created.emit(year);
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
