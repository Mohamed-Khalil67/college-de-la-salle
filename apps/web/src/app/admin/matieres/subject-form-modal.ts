import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form, FormField, maxLength, required, submit, validate } from '@angular/forms/signals';
import { SECTION_IDS, SECTION_LABELS, SUBJECT_LIMITS, type SectionId, type SubjectDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { shownError } from '../shared/admin-format';

interface SubjectModel {
  name: string;
  group: string;
  sections: Record<SectionId, boolean>;
}

let nextId = 0;

/** Creates a subject, or renames / regroups one and sets the sections it is taught in (`editing` set). */
@Component({
  selector: 'app-subject-form-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal [title]="editing() ? 'Modifier la matière' : 'Créer une matière'" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <cdls-field label="Nom" helper="Par exemple « Mathématiques »." [error]="nameError()">
          <input cdlsControl autocomplete="off" [formField]="subjectForm.name" />
        </cdls-field>
        <cdls-field label="Groupe" helper="Pour ranger les matières : Sciences, Langues, Lettres…" [error]="groupError()">
          <input cdlsControl autocomplete="off" [attr.list]="listId" [formField]="subjectForm.group" />
        </cdls-field>
        <datalist [id]="listId">
          @for (group of groups(); track group) {
            <option [value]="group"></option>
          }
        </datalist>

        <fieldset class="sections" [attr.aria-describedby]="sectionsError() ? errorId : null">
          <legend class="field__label">Enseignée en</legend>
          @for (id of sectionIds; track id) {
            <label class="check">
              <input type="checkbox" [formField]="subjectForm.sections[id]" />
              <span>{{ sectionLabels[id] }}</span>
            </label>
          }
          @if (sectionsError()) {
            <p class="field__error" [id]="errorId" role="alert">{{ sectionsError() }}</p>
          }
        </fieldset>

        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : editing() ? 'Enregistrer' : 'Créer la matière' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
  styles: `
    .sections {
      display: grid;
      gap: var(--space-3);
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
  `,
})
export class SubjectFormModal {
  readonly open = model(false);
  readonly editing = input<SubjectDto | null>(null);
  /** The groups already in use, offered as suggestions. */
  readonly groups = input<readonly string[]>([]);
  readonly saved = output<SubjectDto>();

  readonly #api = inject(ApiClient);

  protected readonly sectionIds = SECTION_IDS;
  protected readonly sectionLabels = SECTION_LABELS;
  protected readonly listId = `subject-groups-${++nextId}`;
  protected readonly errorId = `subject-sections-error-${nextId}`;

  protected readonly model = signal<SubjectModel>({ name: '', group: '', sections: { nationale: true, bac: true } });
  protected readonly subjectForm = form(this.model, (p) => {
    required(p.name, { message: 'Saisissez le nom de la matière.' });
    maxLength(p.name, SUBJECT_LIMITS.name, { message: `Le nom compte ${SUBJECT_LIMITS.name} caractères au plus.` });
    required(p.group, { message: 'Saisissez un groupe, par exemple Sciences.' });
    maxLength(p.group, SUBJECT_LIMITS.group, { message: `Le groupe compte ${SUBJECT_LIMITS.group} caractères au plus.` });
    validate(p.sections, ({ value }) =>
      SECTION_IDS.some((id) => value()[id]) ? null : { kind: 'sections', message: 'Cochez au moins une filière.' },
    );
  });
  protected readonly nameError = computed(() => shownError(this.subjectForm.name()));
  protected readonly groupError = computed(() => shownError(this.subjectForm.group()));
  protected readonly attempted = signal(false);
  protected readonly sectionsError = computed(() =>
    this.attempted() ? (this.subjectForm.sections().errors()[0]?.message ?? null) : null,
  );

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const editing = this.editing();
      untracked(() => {
        this.failure.set(null);
        this.attempted.set(false);
        this.subjectForm().reset({
          name: editing?.name ?? '',
          group: editing?.group ?? '',
          sections: {
            nationale: editing ? editing.sections.includes('nationale') : true,
            bac: editing ? editing.sections.includes('bac') : true,
          },
        });
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.attempted.set(true);
    void submit(this.subjectForm, async () => {
      const value = this.model();
      const sections = SECTION_IDS.filter((id) => value.sections[id]);
      const body = { name: value.name.trim(), group: value.group.trim(), sections };
      const editing = this.editing();
      this.busy.set(true);
      this.failure.set(null);
      try {
        const saved = editing ? await this.#api.school.updateSubject(editing.id, body) : await this.#api.school.createSubject(body);
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
