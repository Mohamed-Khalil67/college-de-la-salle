import { Component, computed, inject, input, resource, signal } from '@angular/core';
import type { ClassDto, ClassSubjectDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, EmptyState, Icon } from '../../ui';
import { ConfirmModal } from '../shared/confirm-modal';
import { ClassSubjectAddModal } from './class-subject-add-modal';
import { ClassSubjectCopyModal, type CopyResult } from './class-subject-copy-modal';
import { ClassSubjectRow } from './class-subject-row';
import { classSubjectTotals, copyMessage, copySummary, formatDecimal } from './class-subject-values';

/** « Matières de la classe »: coefficient and hours edited in place, add, remove, and copy from another class. */
@Component({
  selector: 'app-class-subjects-tab',
  imports: [Alert, Button, EmptyState, Icon, ConfirmModal, ClassSubjectAddModal, ClassSubjectCopyModal, ClassSubjectRow],
  template: `
    <div class="stack">
      <div class="toolbar-row">
        <p class="t-muted">
          Le coefficient pèse dans la moyenne générale des bulletins. Chaque champ s’enregistre quand vous le quittez ou
          que vous appuyez sur Entrée.
        </p>
        <div class="page__actions">
          <button cdlsButton variant="secondary" type="button" (click)="copyOpen.set(true)">Copier depuis la classe…</button>
          <button cdlsButton type="button" (click)="addOpen.set(true)"><cdls-icon name="plus" />Ajouter une matière</button>
        </div>
      </div>

      @if (notice()) {
        <cdls-alert tone="success">{{ notice() }}</cdls-alert>
      }

      @if (rows.error()) {
        <cdls-alert tone="danger">{{ errorText() }}</cdls-alert>
      } @else if (rows.hasValue()) {
        @if (rows.value().length) {
          <div class="table-wrap" role="region" aria-labelledby="subjects-caption" tabindex="0">
            <table class="table table--stack">
              <caption id="subjects-caption" class="visually-hidden">Matières de la classe {{ schoolClass().label }}, coefficient et heures par semaine</caption>
              <thead>
                <tr>
                  <th scope="col">Matière</th>
                  <th scope="col">Enseignants</th>
                  <th scope="col" class="num">Coefficient</th>
                  <th scope="col" class="num">Heures par semaine</th>
                  <th scope="col">État</th>
                  <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows.value(); track row.id) {
                  <tr appClassSubjectRow [row]="row" (changed)="onChanged($event)" (remove)="startRemove($event)"></tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total : {{ totals().count }} matières</th>
                  <td></td>
                  <td class="num" data-label="Coefficients :">{{ formatDecimal(totals().coefficient) }}</td>
                  <td class="num" data-label="Heures :">{{ totals().hours === null ? '—' : formatDecimal(totals().hours) }}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        } @else {
          <cdls-empty-state icon="book" title="Aucune matière dans cette classe" description="Ajoutez les matières une à une, ou copiez celles d’une autre classe.">
            <button cdlsButton variant="secondary" type="button" (click)="copyOpen.set(true)">Copier depuis la classe…</button>
          </cdls-empty-state>
        }
      } @else {
        <p class="loading-line" role="status">Chargement des matières…</p>
      }
    </div>

    <app-class-subject-add-modal
      [(open)]="addOpen"
      [classId]="schoolClass().id"
      [sectionCode]="schoolClass().sectionCode"
      [existing]="current()"
      (added)="onAdded($event)"
    />
    <app-class-subject-copy-modal [(open)]="copyOpen" [classId]="schoolClass().id" [schoolYearId]="schoolClass().schoolYearId" (copied)="onCopied($event)" />

    <app-confirm-modal
      title="Retirer cette matière de la classe ?"
      confirmLabel="Retirer la matière"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="removeOpen"
      (confirmed)="remove()"
    >
      <p><strong>{{ removing()?.subjectName }}</strong> ne fera plus partie de la classe {{ schoolClass().label }}.</p>
      <p class="t-body-s t-muted">C’est refusé tant qu’un enseignant lui est affecté ou que des notes existent.</p>
    </app-confirm-modal>
  `,
  styles: `
    .toolbar-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
    }
    .toolbar-row p {
      max-width: 38rem;
    }
  `,
})
export class ClassSubjectsTab {
  readonly schoolClass = input.required<ClassDto>();

  readonly #api = inject(ApiClient);
  protected readonly formatDecimal = formatDecimal;

  protected readonly rows = resource({ params: () => this.schoolClass().id, loader: ({ params }) => this.#api.school.classSubjects(params) });
  protected readonly current = computed<readonly ClassSubjectDto[]>(() => (this.rows.hasValue() ? this.rows.value() : []));
  protected readonly totals = computed(() => classSubjectTotals(this.current()));

  protected readonly addOpen = signal(false);
  protected readonly copyOpen = signal(false);
  protected readonly removeOpen = signal(false);
  protected readonly removing = signal<ClassSubjectDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected errorText(): string {
    return apiMessage(this.rows.error(), 'Impossible de charger les matières de la classe. Réessayez dans un instant.');
  }

  protected onChanged(saved: ClassSubjectDto): void {
    this.rows.update((list) => (list ?? []).map((row) => (row.id === saved.id ? saved : row)));
  }

  protected onAdded(row: ClassSubjectDto): void {
    this.notice.set(`« ${row.subjectName} » est ajoutée à la classe.`);
    this.rows.reload();
  }

  protected onCopied(result: CopyResult): void {
    this.notice.set(copyMessage(copySummary(this.current(), result.rows), result.from.label));
    this.rows.set([...result.rows]);
  }

  protected startRemove(row: ClassSubjectDto): void {
    this.removing.set(row);
    this.actionError.set(null);
    this.removeOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const row = this.removing();
    if (!row) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.#api.school.removeClassSubject(row.id);
      this.removeOpen.set(false);
      this.notice.set(`« ${row.subjectName} » est retirée de la classe.`);
      this.rows.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
