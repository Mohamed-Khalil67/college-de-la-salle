import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { disabled, form, FormField, maxLength, required, submit, validate } from '@angular/forms/signals';
import { ACTIVITY_TYPE_LIMITS, type ActivityColour, type ActivityIcon, type ActivityTypeDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Icon, Modal } from '../../../shared/ui';
import { ActivityTypeChip } from './activity-type-chip';
import { COLOUR_OPTIONS, flagsProblem, ICON_OPTIONS } from './activity-palette';
import { shownError } from '../../../shared/utils/forms';

interface TypeModel {
  label: string;
  colour: ActivityColour;
  icon: ActivityIcon;
  gradable: boolean;
  repeatable: boolean;
  homework: boolean;
}

/**
 * Creates an activity type, or edits one (`editing` set): label, colour from the fixed palette, icon and
 * the three options. A teacher creates private types; the admin creates school-wide ones.
 */
@Component({
  selector: 'app-activity-type-form-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl, Icon, ActivityTypeChip],
  template: `
    <cdls-modal [title]="editing() ? 'Modifier le type d’activité' : 'Créer un type d’activité'" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        @if (!editing()) {
          <p class="t-muted">
            @if (forSchool()) {
              Ce type sera proposé à tous les enseignants.
            } @else {
              Ce type est privé : vous seul le voyez, jusqu’à ce que l’administration le partage avec l’école.
            }
          </p>
        } @else {
          <p class="t-muted">Code : <code>{{ editing()?.code }}</code> (créé à partir du nom, il ne change plus).</p>
        }

        <cdls-field label="Nom" helper="Par exemple « Atelier » ou « Sortie »." [error]="labelError()">
          <input cdlsControl autocomplete="off" [formField]="typeForm.label" />
        </cdls-field>

        <fieldset class="choices">
          <legend class="field__label">Couleur</legend>
          <div class="choices__grid">
            @for (option of colours; track option.token) {
              <label class="choice">
                <input type="radio" [value]="option.token" [formField]="typeForm.colour" />
                <span class="choice__swatch" [style.background]="option.tint" [style.border-color]="option.solid" aria-hidden="true"></span>
                <span>{{ option.label }}</span>
              </label>
            }
          </div>
        </fieldset>

        <fieldset class="choices">
          <legend class="field__label">Icône</legend>
          <div class="choices__grid">
            @for (option of icons; track option.name) {
              <label class="choice">
                <input type="radio" [value]="option.name" [formField]="typeForm.icon" />
                <cdls-icon [name]="option.name" />
                <span>{{ option.label }}</span>
              </label>
            }
          </div>
        </fieldset>

        <fieldset class="choices">
          <legend class="field__label">Options</legend>
          <label class="check">
            <input type="checkbox" [formField]="typeForm.gradable" />
            <span>Noté : les enseignants peuvent saisir des notes</span>
          </label>
          <label class="check">
            <input type="checkbox" [formField]="typeForm.repeatable" />
            <span>Chaque semaine : peut se répéter dans l’emploi du temps</span>
          </label>
          <label class="check">
            <input type="checkbox" [formField]="typeForm.homework" />
            <span>Devoir à rendre : les élèves le cochent « fait »</span>
          </label>
          @if (flagsError()) {
            <p class="field__error" role="alert"><cdls-icon name="alert" /><span>{{ flagsError() }}</span></p>
          }
          @if (editing()?.isSystem) {
            <p class="field__helper">Un type du système garde ses options : seuls le nom, la couleur et l’icône changent.</p>
          } @else if (editing()) {
            <p class="field__helper">Les options ne changent plus quand des événements utilisent déjà le type.</p>
          }
        </fieldset>

        <div class="preview">
          <span class="t-label">Aperçu</span>
          <app-activity-type-chip [colour]="model().colour" [icon]="model().icon" [label]="model().label.trim() || 'Nom du type'" />
        </div>

        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : editing() ? 'Enregistrer' : 'Créer le type' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
  styles: `
    .choices {
      display: grid;
      gap: var(--space-3);
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    .choices__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
      gap: var(--space-2);
    }
    .choice {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.75rem;
      padding: var(--space-1) var(--space-3);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      cursor: pointer;
    }
    .choice:hover {
      border-color: var(--color-navy-700);
    }
    .choice:has(input:checked) {
      border: 2px solid var(--color-primary);
      padding: calc(var(--space-1) - 1px) calc(var(--space-3) - 1px);
      background: var(--color-info-tint);
    }
    .choice:has(input:focus-visible) {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .choice input {
      accent-color: var(--color-primary);
      width: 1.1rem;
      height: 1.1rem;
      margin: 0;
      flex: none;
    }
    .choice__swatch {
      width: 1.25rem;
      height: 1.25rem;
      border: 2px solid;
      border-radius: var(--radius-full);
      flex: none;
    }
    .preview {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
  `,
})
export class ActivityTypeFormModal {
  readonly open = model(false);
  readonly editing = input<ActivityTypeDto | null>(null);
  /** The admin creates school-wide types; a teacher creates private ones. */
  readonly forSchool = input(false);
  readonly saved = output<ActivityTypeDto>();

  readonly #api = inject(ApiClient);

  protected readonly colours = COLOUR_OPTIONS;
  protected readonly icons = ICON_OPTIONS;

  protected readonly model = signal<TypeModel>({
    label: '',
    colour: 'navy',
    icon: 'book',
    gradable: false,
    repeatable: false,
    homework: false,
  });
  protected readonly typeForm = form(this.model, (p) => {
    required(p.label, { message: 'Saisissez le nom du type.' });
    maxLength(p.label, ACTIVITY_TYPE_LIMITS.label, { message: `Le nom compte ${ACTIVITY_TYPE_LIMITS.label} caractères au plus.` });
    disabled(p.gradable, () => !!this.editing()?.isSystem);
    disabled(p.repeatable, () => !!this.editing()?.isSystem);
    disabled(p.homework, () => !!this.editing()?.isSystem);
    validate(p.homework, ({ valueOf }) => {
      const message = flagsProblem({ repeatable: valueOf(p.repeatable), homework: valueOf(p.homework) });
      return message ? { kind: 'flags', message } : null;
    });
  });
  protected readonly labelError = computed(() => shownError(this.typeForm.label()));
  protected readonly flagsError = computed(() => flagsProblem(this.model()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const editing = this.editing();
      untracked(() => {
        this.failure.set(null);
        this.typeForm().reset({
          label: editing?.label ?? '',
          colour: editing?.colour ?? 'navy',
          icon: editing?.icon ?? 'book',
          gradable: editing?.gradable ?? false,
          repeatable: editing?.repeatable ?? false,
          homework: editing?.homework ?? false,
        });
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.typeForm, async () => {
      const value = this.model();
      const editing = this.editing();
      this.busy.set(true);
      this.failure.set(null);
      try {
        const base = { label: value.label.trim(), colour: value.colour, icon: value.icon };
        const saved = editing
          ? await this.#api.school.updateActivityType(
              editing.id,
              editing.isSystem ? base : { ...base, gradable: value.gradable, repeatable: value.repeatable, homework: value.homework },
            )
          : await this.#api.school.createActivityType({
              ...base,
              gradable: value.gradable,
              repeatable: value.repeatable,
              homework: value.homework,
            });
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
