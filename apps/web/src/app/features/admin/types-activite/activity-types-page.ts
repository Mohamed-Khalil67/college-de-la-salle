import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import type { ActivityTypeDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { Alert, Badge, Button, EmptyState, Icon } from '../../../shared/ui';
import { ConfirmModal } from '../../../shared/components/confirm-modal';
import { focusPageHeading } from '../../../shared/utils/focus';
import { ActivityTypeChip } from './activity-type-chip';
import { ActivityTypeFormModal } from './activity-type-form-modal';
import { flagLabels } from './activity-palette';

type PendingAction = 'archive' | 'delete' | 'promote';

/**
 * Activity types: the school's (system and school-wide) and the teachers' private ones. The admin edits
 * all, archives, deletes and shares a teacher's type with the school; a coordinator creates and edits
 * their own private types and reads the school's.
 */
@Component({
  selector: 'app-activity-types-page',
  imports: [NgTemplateOutlet, Alert, Badge, Button, EmptyState, Icon, ConfirmModal, ActivityTypeChip, ActivityTypeFormModal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Types d’activité</h1>
        <p class="t-muted">
          @if (isAdmin()) {
            Cours, TD, examens… Les types des enseignants restent privés tant que vous ne les partagez pas avec l’école.
          } @else {
            Les types de l’école, et les vôtres. Un type que vous créez reste privé tant que l’administration ne le partage pas.
          }
        </p>
      </div>
      <div class="page__actions">
        <button cdlsButton type="button" (click)="startCreate()"><cdls-icon name="plus" />Créer un type</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }
    @if (pageError()) {
      <cdls-alert tone="danger">{{ pageError() }}</cdls-alert>
    }

    @if (types.error()) {
      <cdls-alert tone="danger">{{ errorText(types.error()) }}</cdls-alert>
    } @else if (types.hasValue()) {
      <div class="stack sections">
        <section class="stack stack--sm" aria-labelledby="school-types">
          <h2 class="t-h2" id="school-types">Types de l’école</h2>
          @if (schoolTypes().length) {
            <ng-container *ngTemplateOutlet="table; context: { $implicit: schoolTypes(), id: 'school' }" />
          } @else {
            <cdls-empty-state icon="book" title="Aucun type de l’école" description="Créez un type pour le proposer à tous les enseignants." />
          }
        </section>

        <section class="stack stack--sm" [attr.aria-labelledby]="'own-types'">
          <h2 class="t-h2" id="own-types">{{ isAdmin() ? 'Types des enseignants' : 'Mes types' }}</h2>
          @if (ownTypes().length) {
            <ng-container *ngTemplateOutlet="table; context: { $implicit: ownTypes(), id: 'own' }" />
          } @else {
            <cdls-empty-state
              icon="users"
              [title]="isAdmin() ? 'Aucun type d’enseignant' : 'Vous n’avez pas encore de type'"
              [description]="isAdmin() ? 'Les types créés par les enseignants apparaîtront ici, prêts à être partagés.' : 'Créez un type pour vos séances particulières : il reste privé.'"
            />
          }
        </section>
      </div>
    } @else {
      <p class="loading-line" role="status">Chargement des types…</p>
    }

    <ng-template #table let-rows let-id="id">
      <div class="table-wrap" role="region" [attr.aria-labelledby]="'caption-' + id" tabindex="0">
        <table class="table table--stack">
          <caption [id]="'caption-' + id" class="visually-hidden">
            {{ id === 'school' ? 'Liste des types de l’école' : isAdmin() ? 'Liste des types des enseignants' : 'Liste de vos types privés' }}
          </caption>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Code</th>
              <th scope="col">Options</th>
              <th scope="col">{{ id === 'school' ? 'Origine' : 'Enseignant' }}</th>
              <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (type of rows; track type.id) {
              <tr>
                <th scope="row">
                  <app-activity-type-chip [colour]="type.colour" [icon]="type.icon" [label]="type.label" />
                  @if (type.archived) {
                    <cdls-badge tone="neutral">Archivé</cdls-badge>
                  }
                </th>
                <td data-label="Code :"><code>{{ type.code }}</code></td>
                <td data-label="Options :">{{ options(type) }}</td>
                <td [attr.data-label]="id === 'school' ? 'Origine :' : 'Enseignant :'">
                  @if (type.isSystem) {
                    <cdls-badge tone="info">Système</cdls-badge>
                  } @else if (type.ownerTeacherId) {
                    {{ type.ownerName }}
                  } @else {
                    <cdls-badge tone="heritage">Partagé avec l’école</cdls-badge>
                  }
                </td>
                <td class="num">
                  <span class="row-actions">
                    @if (canEdit(type)) {
                      <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startEdit(type)">
                        Modifier<span class="visually-hidden"> {{ type.label }}</span>
                      </button>
                    }
                    @if (isAdmin() && type.ownerTeacherId && !type.archived) {
                      <button cdlsButton variant="secondary" size="sm" type="button" (click)="startAction('promote', type)">
                        Partager avec l’école<span class="visually-hidden"> : {{ type.label }}</span>
                      </button>
                    }
                    @if (canEdit(type) && !type.isSystem) {
                      @if (type.archived) {
                        <button cdlsButton variant="tertiary" size="sm" type="button" (click)="restore(type)">
                          Restaurer<span class="visually-hidden"> {{ type.label }}</span>
                        </button>
                      } @else {
                        <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startAction('archive', type)">
                          Archiver<span class="visually-hidden"> {{ type.label }}</span>
                        </button>
                      }
                      <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startAction('delete', type)">
                        Supprimer<span class="visually-hidden"> {{ type.label }}</span>
                      </button>
                    }
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>

    <app-activity-type-form-modal [(open)]="formOpen" [editing]="editing()" [forSchool]="isAdmin()" (saved)="onSaved($event)" />

    <app-confirm-modal
      [title]="confirmTitle()"
      [confirmLabel]="confirmLabel()"
      [danger]="action() !== 'promote'"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="confirmOpen"
      [restoreFocus]="!leaving()"
      (closed)="afterConfirmClosed()"
      (confirmed)="runAction()"
    >
      @switch (action()) {
        @case ('promote') {
          <p>
            <strong>{{ target()?.label }}</strong>, créé par {{ target()?.ownerName }}, sera proposé à tous les enseignants et
            n’appartiendra plus à son auteur.
          </p>
          <p class="t-body-s t-muted">Cette décision ne se défait pas depuis cet écran.</p>
        }
        @case ('archive') {
          <p><strong>{{ target()?.label }}</strong> ne sera plus proposé pour de nouveaux événements. Les événements existants le gardent.</p>
        }
        @case ('delete') {
          <p><strong>{{ target()?.label }}</strong> sera supprimé.</p>
          <p class="t-body-s t-muted">Si des événements l’utilisent, archivez-le plutôt.</p>
        }
      }
    </app-confirm-modal>
  `,
  styles: `
    .sections {
      gap: var(--space-12);
    }
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-1);
    }
  `,
})
export class ActivityTypesPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #document = inject(DOCUMENT);
  protected readonly leaving = signal(false);

  protected readonly isAdmin = computed(() => this.#auth.role() === 'admin');
  protected readonly types = resource({ loader: () => this.#api.school.activityTypes(true) });
  protected readonly all = computed(() => (this.types.hasValue() ? this.types.value() : []));
  protected readonly schoolTypes = computed(() => this.all().filter((t) => !t.ownerTeacherId));
  protected readonly ownTypes = computed(() => this.all().filter((t) => !!t.ownerTeacherId));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ActivityTypeDto | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly action = signal<PendingAction>('archive');
  protected readonly target = signal<ActivityTypeDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly pageError = signal<string | null>(null);

  protected readonly confirmTitle = computed(() => {
    switch (this.action()) {
      case 'promote':
        return 'Partager ce type avec l’école ?';
      case 'archive':
        return 'Archiver ce type ?';
      default:
        return 'Supprimer ce type ?';
    }
  });
  protected readonly confirmLabel = computed(() => {
    switch (this.action()) {
      case 'promote':
        return 'Partager avec l’école';
      case 'archive':
        return 'Archiver le type';
      default:
        return 'Supprimer le type';
    }
  });

  protected options(type: ActivityTypeDto): string {
    return flagLabels(type).join(', ') || 'Aucune';
  }

  /** The admin edits every type; a teacher only their own private ones (the API refuses the rest). */
  protected canEdit(type: ActivityTypeDto): boolean {
    return this.isAdmin() || (!!type.ownerTeacherId && type.ownerTeacherId === this.#auth.user()?.teacherId);
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les types. Réessayez dans un instant.');
  }

  /** After a confirmed action that removed the opener, focus goes to the page heading. */
  protected afterConfirmClosed(): void {
    if (!this.leaving()) return;
    this.leaving.set(false);
    focusPageHeading(this.#document);
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected startEdit(type: ActivityTypeDto): void {
    this.editing.set(type);
    this.formOpen.set(true);
  }

  protected onSaved(type: ActivityTypeDto): void {
    this.pageError.set(null);
    this.notice.set(`Type « ${type.label} » ${this.editing() ? 'modifié' : 'créé'}.`);
    this.types.reload();
  }

  protected startAction(action: PendingAction, type: ActivityTypeDto): void {
    this.action.set(action);
    this.target.set(type);
    this.actionError.set(null);
    this.confirmOpen.set(true);
  }

  protected async runAction(): Promise<void> {
    const type = this.target();
    if (!type) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      switch (this.action()) {
        case 'promote':
          await this.#api.school.promoteActivityType(type.id);
          this.notice.set(`« ${type.label} » est maintenant un type de l’école.`);
          break;
        case 'archive':
          await this.#api.school.updateActivityType(type.id, { archived: true });
          this.notice.set(`« ${type.label} » est archivé.`);
          break;
        case 'delete':
          await this.#api.school.deleteActivityType(type.id);
          this.notice.set(`« ${type.label} » est supprimé.`);
          break;
      }
      this.pageError.set(null);
      this.leaving.set(true);
      this.confirmOpen.set(false);
      this.types.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async restore(type: ActivityTypeDto): Promise<void> {
    this.pageError.set(null);
    try {
      await this.#api.school.updateActivityType(type.id, { archived: false });
      focusPageHeading(this.#document);
      this.notice.set(`« ${type.label} » est de nouveau proposé.`);
      this.types.reload();
    } catch (error) {
      this.notice.set(null);
      this.pageError.set(apiMessage(error));
    }
  }
}
