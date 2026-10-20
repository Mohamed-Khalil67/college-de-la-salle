import { Component, computed, inject, resource, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import type { TeachingAssignmentDto, UserDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, EmptyState, Field, FieldControl, Icon } from '../../ui';
import { ConfirmModal } from '../shared/confirm-modal';
import { fullName, groupBySection, plural } from '../shared/admin-format';
import { AssignmentCreateModal } from './assignment-create-modal';

/** Who teaches what where: teacher × class × subject, with the coefficient. */
@Component({
  selector: 'app-assignments-page',
  imports: [FormField, Alert, Button, EmptyState, Field, FieldControl, Icon, ConfirmModal, AssignmentCreateModal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Affectations</h1>
        <p class="t-muted">Les enseignants et leurs matières dans chaque classe de l’année en cours.</p>
      </div>
      <div class="page__actions">
        <button cdlsButton type="button" (click)="createOpen.set(true)"><cdls-icon name="plus" />Nouvelle affectation</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    <form class="filters filters--two" role="search" aria-label="Filtrer les affectations" (submit)="$event.preventDefault()">
      <cdls-field label="Classe">
        <select cdlsControl [formField]="filterForm.classId">
          <option value="">Toutes les classes</option>
          @for (group of classGroups(); track group.code) {
            <optgroup [label]="group.label">
              @for (item of group.items; track item.id) {
                <option [value]="item.id">{{ item.label }}</option>
              }
            </optgroup>
          }
        </select>
      </cdls-field>
      <cdls-field label="Enseignant">
        <select cdlsControl [formField]="filterForm.teacherId">
          <option value="">Tous les enseignants</option>
          @for (teacher of teacherList(); track teacher.id) {
            <option [value]="teacher.teacherId">{{ name(teacher) }}</option>
          }
        </select>
      </cdls-field>
    </form>

    @if (assignments.error()) {
      <cdls-alert tone="danger">{{ errorText(assignments.error()) }}</cdls-alert>
    } @else if (assignments.hasValue()) {
      @if (assignments.value().length) {
        <p class="t-body-s t-muted count" role="status">{{ countLabel() }}</p>
        <div class="table-wrap" role="region" aria-labelledby="assignments-caption" tabindex="0">
          <table class="table table--stack">
            <caption id="assignments-caption" class="visually-hidden">Affectations : enseignant, classe, matière et coefficient</caption>
            <thead>
              <tr>
                <th scope="col">Enseignant</th>
                <th scope="col">Classe</th>
                <th scope="col">Matière</th>
                <th scope="col" class="num">Coefficient</th>
                <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (item of assignments.value(); track item.id) {
                <tr>
                  <th scope="row">{{ item.teacherName }}</th>
                  <td data-label="Classe :">{{ item.classLabel }}</td>
                  <td data-label="Matière :">{{ item.subjectName }}</td>
                  <td class="num" data-label="Coefficient :">{{ coefficient(item.coefficient) }}</td>
                  <td class="num">
                    <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startDelete(item)">
                      Supprimer<span class="visually-hidden"> l’affectation {{ item.subjectName }}, {{ item.classLabel }}</span>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <cdls-empty-state
          icon="edit"
          title="Aucune affectation"
          [description]="filtered() ? 'Aucune affectation ne correspond à ces filtres.' : 'Créez la première affectation de l’année.'"
        >
          <button cdlsButton variant="secondary" type="button" (click)="createOpen.set(true)">Nouvelle affectation</button>
        </cdls-empty-state>
      }
    } @else {
      <p class="loading-line" role="status">Chargement des affectations…</p>
    }

    <app-assignment-create-modal
      [(open)]="createOpen"
      [teachers]="teacherList()"
      [classes]="classes.hasValue() ? classes.value() : []"
      [subjects]="subjects.hasValue() ? subjects.value() : []"
      [classId]="filters().classId"
      [teacherId]="filters().teacherId"
      (created)="onCreated($event)"
    />
    <app-confirm-modal
      title="Supprimer cette affectation ?"
      confirmLabel="Supprimer l’affectation"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="deleteOpen"
      (confirmed)="remove()"
    >
      @if (deleting(); as item) {
        <p>
          <strong>{{ item.teacherName }}</strong> n’enseignera plus {{ item.subjectName }} en {{ item.classLabel }} : il ne pourra plus
          y saisir de notes. Les notes déjà saisies sont conservées.
        </p>
      }
    </app-confirm-modal>
  `,
  styles: `
    .filters--two {
      grid-template-columns: repeat(auto-fit, minmax(14rem, 20rem));
    }
    .count {
      margin-bottom: var(--space-2);
    }
  `,
})
export class AssignmentsPage {
  readonly #api = inject(ApiClient);

  protected readonly filters = signal({ classId: '', teacherId: '' });
  protected readonly filterForm = form(this.filters);
  protected readonly filtered = computed(() => !!(this.filters().classId || this.filters().teacherId));

  protected readonly assignments = resource({
    params: () => this.filters(),
    loader: ({ params }) => this.#api.school.assignments(params),
  });
  protected readonly classes = resource({ loader: () => this.#api.school.classes() });
  protected readonly subjects = resource({ loader: () => this.#api.school.subjects() });
  protected readonly teachers = resource({ loader: () => this.#api.users.list({ role: 'teacher', pageSize: 100 }) });

  protected readonly classGroups = computed(() => (this.classes.hasValue() ? groupBySection(this.classes.value()) : []));
  protected readonly teacherList = computed<readonly UserDto[]>(() =>
    this.teachers.hasValue() ? this.teachers.value().items.filter((u) => u.teacherId) : [],
  );
  protected readonly countLabel = computed(() =>
    this.assignments.hasValue() ? plural(this.assignments.value().length, 'affectation', 'affectations') : '',
  );

  protected readonly createOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal<TeachingAssignmentDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected name(user: UserDto): string {
    return fullName(user);
  }

  /** « 2 », « 1,5 ». */
  protected coefficient(value: number): string {
    return String(value).replace('.', ',');
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les affectations. Réessayez dans un instant.');
  }

  protected onCreated(item: TeachingAssignmentDto): void {
    this.notice.set(`${item.teacherName} enseigne désormais ${item.subjectName} en ${item.classLabel}.`);
    this.assignments.reload();
  }

  protected startDelete(item: TeachingAssignmentDto): void {
    this.deleting.set(item);
    this.actionError.set(null);
    this.deleteOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const item = this.deleting();
    if (!item) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.#api.school.deleteAssignment(item.id);
      this.deleteOpen.set(false);
      this.notice.set(`Affectation supprimée : ${item.subjectName} en ${item.classLabel}.`);
      this.assignments.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
