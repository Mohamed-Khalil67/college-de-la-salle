import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit, validate } from '@angular/forms/signals';
import { ROOM_KIND_LABELS, ROOM_KINDS, ROOM_LIMITS, type RoomDto, type RoomKind } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../../shared/ui';
import { shownError } from '../../../shared/utils/forms';

interface RoomModel {
  name: string;
  kind: RoomKind;
  capacity: number | null;
  active: boolean;
}

/** Creates a room, or edits one (`editing` set): name, kind, seats and whether it can be chosen. */
@Component({
  selector: 'app-room-form-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal [title]="editing() ? 'Modifier la salle' : 'Créer une salle'" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <cdls-field label="Nom" helper="Par exemple « Salle 12 » ou « Laboratoire de physique »." [error]="nameError()">
          <input cdlsControl autocomplete="off" [formField]="roomForm.name" />
        </cdls-field>
        <cdls-field label="Type de salle">
          <select cdlsControl [formField]="roomForm.kind">
            @for (kind of kinds; track kind) {
              <option [value]="kind">{{ kindLabels[kind] }}</option>
            }
          </select>
        </cdls-field>
        <cdls-field label="Nombre de places" helper="Facultatif. Laissez vide si vous ne le connaissez pas." [error]="capacityError()">
          <input cdlsControl type="number" inputmode="numeric" step="1" [formField]="roomForm.capacity" />
        </cdls-field>
        <label class="check">
          <input type="checkbox" [formField]="roomForm.active" aria-describedby="room-active-help" />
          <span>Salle utilisable</span>
        </label>
        <p class="field__helper" id="room-active-help">
          Une salle désactivée n’apparaît plus quand on choisit un lieu pour un événement. Ceux qui l’ont déjà la gardent.
        </p>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : editing() ? 'Enregistrer' : 'Créer la salle' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class RoomFormModal {
  readonly open = model(false);
  readonly editing = input<RoomDto | null>(null);
  readonly saved = output<RoomDto>();

  readonly #api = inject(ApiClient);

  protected readonly kinds = ROOM_KINDS;
  protected readonly kindLabels = ROOM_KIND_LABELS;

  protected readonly model = signal<RoomModel>({ name: '', kind: 'classroom', capacity: null, active: true });
  protected readonly roomForm = form(this.model, (p) => {
    required(p.name, { message: 'Saisissez le nom de la salle.' });
    maxLength(p.name, ROOM_LIMITS.name, { message: `Le nom compte ${ROOM_LIMITS.name} caractères au plus.` });
    min(p.capacity, 1, { message: 'Le nombre de places est au moins 1. Laissez vide si vous ne le connaissez pas.' });
    max(p.capacity, ROOM_LIMITS.capacity, { message: `Le nombre de places ne dépasse pas ${ROOM_LIMITS.capacity}.` });
    validate(p.capacity, ({ value }) =>
      value() !== null && !Number.isInteger(value()) ? { kind: 'integer', message: 'Saisissez un nombre entier de places.' } : null,
    );
  });
  protected readonly nameError = computed(() => shownError(this.roomForm.name()));
  protected readonly capacityError = computed(() => shownError(this.roomForm.capacity()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const editing = this.editing();
      untracked(() => {
        this.failure.set(null);
        this.roomForm().reset({
          name: editing?.name ?? '',
          kind: editing?.kind ?? 'classroom',
          capacity: editing?.capacity ?? null,
          active: editing?.active ?? true,
        });
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.roomForm, async () => {
      const value = this.model();
      const body = { name: value.name.trim(), kind: value.kind, capacity: value.capacity ?? null, active: value.active };
      const editing = this.editing();
      this.busy.set(true);
      this.failure.set(null);
      try {
        const saved = editing ? await this.#api.school.updateRoom(editing.id, body) : await this.#api.school.createRoom(body);
        this.saved.emit(saved);
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
