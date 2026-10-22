import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { GROUP_LIMITS, type GroupDetailDto, type GroupWithMembersDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../ui';
import { shownError } from '../admin/shared/admin-format';

interface GroupModel {
  division: string;
  label: string;
}

let nextId = 0;

/** Creates a group of a class, or renames / changes the division of one (`editing`). */
@Component({
  selector: 'app-group-form-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal [title]="editing() ? 'Modifier le groupe' : 'Nouveau groupe'" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <cdls-field
          label="Division"
          helper="Les groupes d’une même division ont cours en même temps, et un élève n’est que dans un groupe par division. Par exemple « TP » ou « LV2 »."
          [error]="divisionError()"
        >
          <input cdlsControl autocomplete="off" [attr.list]="listId" [formField]="groupForm.division" />
        </cdls-field>
        <datalist [id]="listId">
          @for (d of divisions(); track d) {
            <option [value]="d"></option>
          }
        </datalist>
        <cdls-field label="Nom du groupe" helper="Par exemple « TP A » ou « Allemand »." [error]="labelError()">
          <input cdlsControl autocomplete="off" [formField]="groupForm.label" />
        </cdls-field>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : editing() ? 'Enregistrer' : 'Créer le groupe' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class GroupFormModal {
  readonly open = model(false);
  readonly classId = input.required<string>();
  /** Divisions the class already has, offered while typing. */
  readonly groups = input<readonly GroupWithMembersDto[]>([]);
  readonly editing = input<GroupWithMembersDto | null>(null);
  readonly saved = output<GroupDetailDto>();

  readonly #api = inject(ApiClient);
  protected readonly listId = `group-divisions-${++nextId}`;
  protected readonly divisions = computed(() => [...new Set(this.groups().map((g) => g.division))].sort((a, b) => a.localeCompare(b, 'fr')));

  protected readonly model = signal<GroupModel>({ division: '', label: '' });
  protected readonly groupForm = form(this.model, (p) => {
    required(p.division, { message: 'Saisissez la division, par exemple « TP » ou « LV2 ».' });
    maxLength(p.division, GROUP_LIMITS.division, { message: `La division compte ${GROUP_LIMITS.division} caractères au plus.` });
    required(p.label, { message: 'Saisissez le nom du groupe, par exemple « TP A ».' });
    maxLength(p.label, GROUP_LIMITS.label, { message: `Le nom compte ${GROUP_LIMITS.label} caractères au plus.` });
  });
  protected readonly divisionError = computed(() => shownError(this.groupForm.division()));
  protected readonly labelError = computed(() => shownError(this.groupForm.label()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const editing = this.editing();
      untracked(() => {
        this.failure.set(null);
        this.groupForm().reset({ division: editing?.division ?? this.divisions()[0] ?? '', label: editing?.label ?? '' });
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.groupForm, async () => {
      const value = this.model();
      const division = value.division.trim();
      const label = value.label.trim();
      const editing = this.editing();
      this.busy.set(true);
      this.failure.set(null);
      try {
        const saved = editing
          ? await this.#api.groups.update(editing.id, { division, label })
          : await this.#api.groups.create({ classId: this.classId(), division, label });
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
