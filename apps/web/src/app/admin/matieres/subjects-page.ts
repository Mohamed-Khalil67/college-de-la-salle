import { Component, computed, inject, resource, signal } from '@angular/core';
import { SECTION_LABELS, type SubjectDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Badge, Button, EmptyState, Icon } from '../../ui';
import { ConfirmModal } from '../shared/confirm-modal';
import { SubjectFormModal } from './subject-form-modal';

/** Subjects of the school: create, rename, set the sections they are taught in, archive and restore. */
@Component({
  selector: 'app-subjects-page',
  imports: [Alert, Badge, Button, EmptyState, Icon, ConfirmModal, SubjectFormModal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Matières</h1>
        <p class="t-muted">Le catalogue du collège. Chaque classe choisit ensuite ses matières, avec leur coefficient.</p>
      </div>
      <div class="page__actions">
        <button cdlsButton type="button" (click)="startCreate()"><cdls-icon name="plus" />Créer une matière</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }
    @if (pageError()) {
      <cdls-alert tone="danger">{{ pageError() }}</cdls-alert>
    }

    @if (subjects.error()) {
      <cdls-alert tone="danger">{{ errorText(subjects.error()) }}</cdls-alert>
    } @else if (subjects.hasValue()) {
      <label class="check show-archived">
        <input type="checkbox" [checked]="showArchived()" (change)="showArchived.set(!showArchived())" />
        <span>Afficher les matières archivées ({{ archivedCount() }})</span>
      </label>

      @if (shown().length) {
        <div class="table-wrap" role="region" aria-labelledby="subjects-caption" tabindex="0">
          <table class="table table--stack">
            <caption id="subjects-caption" class="visually-hidden">Matières du collège, par groupe</caption>
            <thead>
              <tr>
                <th scope="col">Matière</th>
                <th scope="col">Groupe</th>
                <th scope="col">Filières</th>
                <th scope="col">Statut</th>
                <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (subject of shown(); track subject.id) {
                <tr>
                  <th scope="row">{{ subject.name }}</th>
                  <td data-label="Groupe :">{{ subject.group }}</td>
                  <td data-label="Filières :">{{ sectionsText(subject) }}</td>
                  <td data-label="Statut :">
                    @if (subject.archived) {
                      <cdls-badge tone="neutral">Archivée</cdls-badge>
                    } @else {
                      <cdls-badge tone="success">Active</cdls-badge>
                    }
                  </td>
                  <td class="num">
                    <span class="row-actions">
                      <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startEdit(subject)">
                        Modifier<span class="visually-hidden"> {{ subject.name }}</span>
                      </button>
                      @if (subject.archived) {
                        <button cdlsButton variant="tertiary" size="sm" type="button" (click)="restore(subject)">
                          Restaurer<span class="visually-hidden"> {{ subject.name }}</span>
                        </button>
                      } @else {
                        <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startArchive(subject)">
                          Archiver<span class="visually-hidden"> {{ subject.name }}</span>
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
        <cdls-empty-state icon="book" title="Aucune matière" description="Créez la première matière du collège.">
          <button cdlsButton variant="secondary" type="button" (click)="startCreate()">Créer une matière</button>
        </cdls-empty-state>
      }
    } @else {
      <p class="loading-line" role="status">Chargement des matières…</p>
    }

    <app-subject-form-modal [(open)]="formOpen" [editing]="editing()" [groups]="groups()" (saved)="onSaved($event)" />

    <app-confirm-modal
      title="Archiver cette matière ?"
      confirmLabel="Archiver la matière"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="archiveOpen"
      (confirmed)="archive()"
    >
      <p><strong>{{ archiving()?.name }}</strong> ne pourra plus être ajoutée à une classe.</p>
      <p class="t-body-s t-muted">Les notes déjà saisies et les classes qui l’ont déjà ne changent pas. Vous pourrez la restaurer.</p>
    </app-confirm-modal>
  `,
  styles: `
    .show-archived {
      margin-bottom: var(--space-4);
    }
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-1);
    }
  `,
})
export class SubjectsPage {
  readonly #api = inject(ApiClient);

  protected readonly subjects = resource({ loader: () => this.#api.school.subjects(true) });
  protected readonly showArchived = signal(false);
  protected readonly all = computed(() => (this.subjects.hasValue() ? this.subjects.value() : []));
  protected readonly shown = computed(() => this.all().filter((s) => this.showArchived() || !s.archived));
  protected readonly archivedCount = computed(() => this.all().filter((s) => s.archived).length);
  protected readonly groups = computed(() => [...new Set(this.all().map((s) => s.group))].sort((a, b) => a.localeCompare(b, 'fr')));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<SubjectDto | null>(null);
  protected readonly archiveOpen = signal(false);
  protected readonly archiving = signal<SubjectDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly pageError = signal<string | null>(null);

  protected sectionsText(subject: SubjectDto): string {
    return subject.sections.map((s) => SECTION_LABELS[s]).join(', ');
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les matières. Réessayez dans un instant.');
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected startEdit(subject: SubjectDto): void {
    this.editing.set(subject);
    this.formOpen.set(true);
  }

  protected onSaved(subject: SubjectDto): void {
    this.notice.set(`Matière « ${subject.name} » ${this.editing() ? 'modifiée' : 'créée'}.`);
    this.subjects.reload();
  }

  protected startArchive(subject: SubjectDto): void {
    this.archiving.set(subject);
    this.actionError.set(null);
    this.archiveOpen.set(true);
  }

  protected async archive(): Promise<void> {
    const subject = this.archiving();
    if (!subject) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.#api.school.updateSubject(subject.id, { archived: true });
      this.archiveOpen.set(false);
      this.notice.set(`« ${subject.name} » est archivée.`);
      this.subjects.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async restore(subject: SubjectDto): Promise<void> {
    this.pageError.set(null);
    try {
      await this.#api.school.updateSubject(subject.id, { archived: false });
      this.notice.set(`« ${subject.name} » est de nouveau active.`);
      this.subjects.reload();
    } catch (error) {
      this.notice.set(null);
      this.pageError.set(apiMessage(error));
    }
  }
}
