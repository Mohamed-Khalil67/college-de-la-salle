import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, linkedSignal, type Resource, resource, signal } from '@angular/core';
import { type ClassDto, type GroupWithMembersDto, SECTION_LABELS } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';
import { Alert, Badge, Button, EmptyState, Icon } from '../../shared/ui';
import { ConfirmModal } from '../../shared/components/confirm-modal';
import { focusPageHeading } from '../../shared/utils/focus';
import { LoadState } from '../../shared/components/load-state';
import { teacherAssignments } from '../../shared/data/teacher-data';
import { GroupFormModal } from './group-form-modal';
import { GroupMembersModal } from './group-members-modal';
import { divisionBlocks } from './groups-logic';
import { studentName } from '../../shared/utils/targets';

/**
 * « Groupes »: the parts of a class (TP A and TP B, LV2 Allemand and Espagnol), by division. A teacher manages
 * the groups of the classes they teach; the admin and the coordinators those of every class. One page for
 * both spaces: the classes offered follow the role.
 */
@Component({
  selector: 'app-groups-page',
  imports: [Alert, Badge, Button, EmptyState, Icon, LoadState, ConfirmModal, GroupFormModal, GroupMembersModal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Groupes</h1>
        <p class="t-muted">
          Une classe se partage en groupes : TP A et TP B, ou les langues vivantes. Les groupes d’une même division ont cours en même
          temps, et un élève n’est que dans un groupe par division.
        </p>
      </div>
      <div class="page__actions">
        <button cdlsButton type="button" [disabled]="!classId()" (click)="startCreate()"><cdls-icon name="plus" />Nouveau groupe</button>
      </div>
    </div>

    <app-load-state [ref]="classesLoad()" label="Chargement des classes…" />
    @if (classes().length) {
      <div class="field class-picker">
        <label class="field__label" for="groupes-classe">Classe</label>
        <select class="field__control" id="groupes-classe" (change)="classId.set($any($event.target).value)">
          @for (c of classes(); track c.id) {
            <option [value]="c.id" [selected]="c.id === classId()">{{ c.label }}</option>
          }
        </select>
      </div>

      @if (notice()) {
        <cdls-alert tone="success">{{ notice() }}</cdls-alert>
      }
      <app-load-state [ref]="groups" label="Chargement des groupes…" />
      <app-load-state [ref]="roster" label="Chargement des élèves…" />

      @if (groups.hasValue() && roster.hasValue()) {
        @if (blocks().length) {
          @for (block of blocks(); track block.division) {
            <section class="division" [attr.aria-labelledby]="'division-' + $index">
              <h2 class="t-h2" [id]="'division-' + $index">Division « {{ block.division }} »</h2>
              @if (block.withoutGroup.length) {
                <p class="t-body-s t-muted">
                  {{ withoutText(block.withoutGroup.length) }} :
                  {{ names(block.withoutGroup) }}
                </p>
              } @else {
                <p class="t-body-s t-muted">Tous les élèves de la classe sont dans un groupe de cette division.</p>
              }
              <div class="table-wrap" role="region" [attr.aria-labelledby]="'caption-' + $index" tabindex="0">
                <table class="table table--stack">
                  <caption [id]="'caption-' + $index" class="visually-hidden">Groupes de la division {{ block.division }}, classe {{ className() }}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Groupe</th>
                      <th scope="col" class="num">Élèves</th>
                      <th scope="col"><span class="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (g of block.groups; track g.id) {
                      <tr>
                        <th scope="row">{{ g.label }}</th>
                        <td class="num" data-label="Élèves :">
                          @if (g.memberCount) {
                            {{ g.memberCount }}
                          } @else {
                            <cdls-badge tone="warning">Vide</cdls-badge>
                          }
                        </td>
                        <td>
                          <span class="row-actions">
                            <button cdlsButton variant="secondary" size="sm" type="button" (click)="startMembers(g)">
                              Gérer les élèves<span class="visually-hidden"> de {{ g.label }}</span>
                            </button>
                            <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startEdit(g)">
                              Modifier<span class="visually-hidden"> {{ g.label }}</span>
                            </button>
                            <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startDelete(g)">
                              Supprimer<span class="visually-hidden"> {{ g.label }}</span>
                            </button>
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        } @else {
          <cdls-empty-state
            icon="users"
            title="Pas encore de groupe dans cette classe"
            description="Créez un groupe, par exemple « TP A » dans la division « TP », puis ajoutez-y des élèves. Vous pourrez ensuite lui donner des séances et des devoirs."
          >
            <button cdlsButton variant="secondary" type="button" (click)="startCreate()">Nouveau groupe</button>
          </cdls-empty-state>
        }
      }
    } @else if (classesReady()) {
      <cdls-empty-state icon="users" title="Aucune classe" description="Vous n’êtes affecté à aucune classe cette année." />
    }

    @if (classId()) {
      <app-group-form-modal [(open)]="formOpen" [classId]="classId()" [groups]="groupList()" [editing]="editing()" (saved)="onSaved($event.label)" />
      <app-group-members-modal [(open)]="membersOpen" [groupId]="membersGroup()?.id ?? null" [groups]="groupList()" [roster]="rosterList()" (changed)="groups.reload()" />
    }

    <app-confirm-modal
      title="Supprimer ce groupe ?"
      confirmLabel="Supprimer le groupe"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="deleteOpen"
      [restoreFocus]="!leaving()"
      (closed)="afterConfirmClosed()"
      (confirmed)="remove()"
    >
      <p><strong>{{ deleting()?.label }}</strong> sera supprimé. Ses élèves restent dans la classe.</p>
      <p class="t-body-s t-muted">Un groupe qui a des séances ou des devoirs ne peut pas être supprimé : changez d’abord leur assignation.</p>
    </app-confirm-modal>
  `,
  styles: `
    .class-picker {
      max-width: 22rem;
      margin-bottom: var(--space-6);
    }
    .division {
      margin-bottom: var(--space-8);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-1);
    }
  `,
})
export class GroupsPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #document = inject(DOCUMENT);

  /** The admin and the coordinators manage every class; a teacher the classes they teach. */
  readonly #staff = computed(() => this.#auth.role() === 'admin' || !!this.#auth.user()?.isCoordinator);
  readonly #allClasses = resource({
    params: () => (this.#staffKnown() && this.#staff() ? true : undefined),
    loader: () => this.#api.school.classes(),
  });
  readonly #assigned = teacherAssignments();
  readonly #staffKnown = computed(() => !!this.#auth.user());

  protected readonly classes = computed<readonly { id: string; label: string }[]>(() => {
    if (this.#staff()) {
      return (this.#allClasses.hasValue() ? this.#allClasses.value() : [])
        .map((c: ClassDto) => ({ id: c.id, label: `${c.label} (${SECTION_LABELS[c.sectionCode]})` }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    }
    const list = this.#assigned.hasValue() ? this.#assigned.value() : [];
    return [...new Map(list.map((a) => [a.classId, a.classLabel]))]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  });
  protected readonly classesLoad = computed<Resource<unknown>>(() => (this.#staff() ? this.#allClasses : this.#assigned));
  protected readonly classesReady = computed(() => this.classesLoad().hasValue());
  protected readonly classId = linkedSignal(() => this.classes()[0]?.id ?? '');
  protected readonly className = computed(() => this.classes().find((c) => c.id === this.classId())?.label ?? '');

  protected readonly groups = resource({
    params: () => this.classId() || undefined,
    loader: ({ params }) => this.#api.groups.list(params),
  });
  protected readonly roster = resource({
    params: () => this.classId() || undefined,
    loader: ({ params }) => this.#api.school.classStudents(params),
  });
  protected readonly groupList = computed<readonly GroupWithMembersDto[]>(() => (this.groups.hasValue() ? this.groups.value() : []));
  protected readonly rosterList = computed(() => (this.roster.hasValue() ? this.roster.value() : []));
  protected readonly blocks = computed(() => divisionBlocks(this.groupList(), this.rosterList()));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<GroupWithMembersDto | null>(null);
  protected readonly membersOpen = signal(false);
  protected readonly membersGroup = signal<GroupWithMembersDto | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal<GroupWithMembersDto | null>(null);
  protected readonly leaving = signal(false);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected names(list: readonly { firstName: string; lastName: string }[]): string {
    return list.map(studentName).join(', ');
  }
  protected withoutText(n: number): string {
    return n === 1 ? '1 élève n’est dans aucun groupe' : `${n} élèves ne sont dans aucun groupe`;
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }
  protected startEdit(g: GroupWithMembersDto): void {
    this.editing.set(g);
    this.formOpen.set(true);
  }
  protected startMembers(g: GroupWithMembersDto): void {
    this.membersGroup.set(g);
    this.membersOpen.set(true);
  }
  protected onSaved(label: string): void {
    this.notice.set(`Groupe « ${label} » ${this.editing() ? 'modifié' : 'créé'}.`);
    this.groups.reload();
  }

  protected startDelete(g: GroupWithMembersDto): void {
    this.deleting.set(g);
    this.actionError.set(null);
    this.deleteOpen.set(true);
  }
  protected afterConfirmClosed(): void {
    if (!this.leaving()) return;
    this.leaving.set(false);
    focusPageHeading(this.#document);
  }
  protected async remove(): Promise<void> {
    const g = this.deleting();
    if (!g) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.#api.groups.remove(g.id);
      this.leaving.set(true);
      this.deleteOpen.set(false);
      this.notice.set(`Groupe « ${g.label} » supprimé.`);
      this.groups.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
