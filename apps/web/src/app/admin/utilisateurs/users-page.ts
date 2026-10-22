import { Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { debounce, form, FormField } from '@angular/forms/signals';
import type { ClassDto, Paginated, Role, UserDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';
import { Alert, Button, EmptyState, Field, FieldControl, Icon, Pagination, Tabs } from '../../ui';
import { ConfirmModal } from '../shared/confirm-modal';
import { fullName, isRole, plural, ROLE_LABELS, ROLE_TABS } from '../shared/admin-format';
import { ArchiveModal, type ArchiveTarget } from './archive-modal';
import { UserCreateModal } from './user-create-modal';
import { UserEditModal } from './user-edit-modal';
import { UsersImportModal } from './users-import-modal';
import { UsersTable } from './users-table';

const PAGE_SIZE = 20;

/** Accounts of the college by role: search, pages, creation, CSV import, edit and deactivation. */
@Component({
  selector: 'app-users-page',
  imports: [
    FormField,
    Alert,
    Button,
    EmptyState,
    Field,
    FieldControl,
    Icon,
    Pagination,
    Tabs,
    ConfirmModal,
    ArchiveModal,
    UserCreateModal,
    UserEditModal,
    UsersImportModal,
    UsersTable,
  ],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Utilisateurs</h1>
        <p class="t-muted">{{ subtitle() }}</p>
        @if (role() === 'teacher') {
          <p class="t-body-s t-muted">
            Un coordinateur modifie les matières, les salles, les périodes, les vacances et les semaines d’examens, comme l’administration.
          </p>
        }
      </div>
      <div class="page__actions">
        <button cdlsButton variant="secondary" type="button" (click)="importOpen.set(true)"><cdls-icon name="upload" />Importer un CSV</button>
        <button cdlsButton type="button" (click)="createOpen.set(true)"><cdls-icon name="plus" />Ajouter un utilisateur</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }
    @if (pageError()) {
      <cdls-alert tone="danger">{{ pageError() }}</cdls-alert>
    }

    <cdls-tabs [tabs]="tabs()" label="Type de compte" [(value)]="tab">
      <form class="filters" role="search" [attr.aria-label]="'Filtrer les ' + labels().noun" (submit)="$event.preventDefault()">
        <cdls-field label="Rechercher">
          <div class="search">
            <cdls-icon name="search" />
            <input cdlsControl type="search" placeholder="Nom ou adresse e-mail" autocomplete="off" [formField]="searchForm.q" />
          </div>
        </cdls-field>
      </form>

      @if (users.error()) {
        <cdls-alert tone="danger">{{ errorText(users.error()) }}</cdls-alert>
      } @else if (shown(); as list) {
        @if (list.items.length) {
          <div [attr.aria-busy]="users.isLoading()">
            <app-users-table
              [users]="list.items"
              [role]="role()"
              [caption]="caption()"
              [classes]="classById()"
              [now]="now"
              [selfId]="selfId()"
              [busyId]="coordinatorBusyId()"
              [revision]="revision()"
              (coordinator)="setCoordinator($event)"
              (edit)="startEdit($event)"
              (deactivate)="startDeactivate($event)"
              (archive)="startArchive($event)"
            />
          </div>
          <cdls-pagination [total]="list.total" [pageSize]="pageSize" [noun]="labels().noun" [label]="'Pagination des ' + labels().noun" [(page)]="page" />
        } @else if (search()) {
          <cdls-empty-state
            [title]="'Aucun résultat pour « ' + search() + ' »'"
            description="Vérifiez l’orthographe ou effacez la recherche."
          >
            <button cdlsButton variant="secondary" type="button" (click)="clearSearch()">Effacer la recherche</button>
          </cdls-empty-state>
        } @else {
          <cdls-empty-state icon="users" title="Aucun compte pour l’instant" description="Ajoutez un compte ou importez un fichier CSV.">
            <button cdlsButton variant="secondary" type="button" (click)="createOpen.set(true)">Ajouter un utilisateur</button>
          </cdls-empty-state>
        }
      } @else {
        <p class="loading-line" role="status">Chargement des comptes…</p>
      }
    </cdls-tabs>

    <app-user-create-modal [(open)]="createOpen" [classes]="classList()" [defaultRole]="role()" (created)="onChanged()" />
    <app-users-import-modal [(open)]="importOpen" (imported)="onChanged()" />
    <app-user-edit-modal [(open)]="editOpen" [user]="editing()" [selfId]="selfId()" (saved)="onSaved($event)" />
    <app-archive-modal [(open)]="archiveOpen" [target]="archiveTarget()" (archived)="onArchived($event)" />
    <app-confirm-modal
      title="Désactiver ce compte ?"
      confirmLabel="Désactiver le compte"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="deactivateOpen"
      (confirmed)="deactivate()"
    >
      <p>
        <strong>{{ deactivatingName() }}</strong> ne pourra plus se connecter et sera déconnecté de tous ses appareils.
        Ses notes, absences et bulletins sont conservés.
      </p>
      <p class="t-body-s t-muted">Vous pourrez réactiver le compte avec « Modifier ».</p>
    </app-confirm-modal>
  `,
})
export class UsersPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly now = new Date();
  protected readonly selfId = computed(() => this.#auth.user()?.id ?? null);

  protected readonly tab = signal<string>('student');
  protected readonly role = computed<Role>(() => {
    const tab = this.tab();
    return isRole(tab) ? tab : 'student';
  });
  protected readonly labels = computed(() => ROLE_LABELS[this.role()]);

  protected readonly searchModel = signal({ q: '' });
  protected readonly searchForm = form(this.searchModel, (p) => debounce(p.q, 300));
  protected readonly search = computed(() => this.searchModel().q.trim());
  protected readonly page = linkedSignal({ source: () => [this.role(), this.search()] as const, computation: () => 1 });

  protected readonly users = resource({
    params: () => ({ role: this.role(), search: this.search(), page: this.page() }),
    loader: ({ params }) => this.#api.users.list({ ...params, pageSize: PAGE_SIZE }),
  });
  /** The last page received, kept on screen while the next one loads. */
  protected readonly shown = linkedSignal<Paginated<UserDto> | undefined, Paginated<UserDto> | undefined>({
    source: () => (this.users.hasValue() ? this.users.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });

  protected readonly totals = resource({
    loader: async () => {
      const pages = await Promise.all(ROLE_TABS.map((role) => this.#api.users.list({ role, pageSize: 1 })));
      return Object.fromEntries(ROLE_TABS.map((role, i) => [role, pages[i].total])) as Record<Role, number>;
    },
  });
  protected readonly classes = resource({ loader: () => this.#api.school.classes() });
  protected readonly classList = computed<readonly ClassDto[]>(() => (this.classes.hasValue() ? this.classes.value() : []));
  protected readonly classById = computed(() => new Map(this.classList().map((c) => [c.id, c])));

  protected readonly tabs = computed(() => {
    const totals = this.totals.hasValue() ? this.totals.value() : null;
    return ROLE_TABS.map((role) => ({ id: role, label: ROLE_LABELS[role].tab, count: totals?.[role] ?? null }));
  });
  protected readonly subtitle = computed(() => {
    if (!this.totals.hasValue()) return 'Comptes des élèves, des enseignants et de l’administration';
    const total = Object.values(this.totals.value()).reduce((sum, n) => sum + n, 0);
    return `${plural(total, 'compte', 'comptes')} au total`;
  });
  protected readonly caption = computed(() => {
    const base = `${ROLE_LABELS[this.role()].tab}, triés par nom`;
    return this.search() ? `${base}, recherche « ${this.search()} »` : base;
  });

  protected readonly createOpen = signal(false);
  protected readonly importOpen = signal(false);
  protected readonly editOpen = signal(false);
  protected readonly editing = signal<UserDto | null>(null);
  protected readonly archiveOpen = signal(false);
  protected readonly archiveTarget = signal<ArchiveTarget | null>(null);
  protected readonly deactivateOpen = signal(false);
  protected readonly deactivating = signal<UserDto | null>(null);
  protected readonly deactivatingName = computed(() => {
    const user = this.deactivating();
    return user ? fullName(user) : '';
  });
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly pageError = signal<string | null>(null);
  protected readonly coordinatorBusyId = signal<string | null>(null);
  protected readonly revision = signal(0);

  protected async setCoordinator(change: { readonly user: UserDto; readonly value: boolean }): Promise<void> {
    if (this.coordinatorBusyId()) return;
    this.coordinatorBusyId.set(change.user.id);
    this.pageError.set(null);
    try {
      await this.#api.users.update(change.user.id, { isCoordinator: change.value });
      this.notice.set(
        change.value
          ? `${fullName(change.user)} est maintenant coordinateur : ${change.user.firstName} modifie la structure de l’année.`
          : `${fullName(change.user)} n’est plus coordinateur.`,
      );
      this.users.reload();
    } catch (error) {
      this.notice.set(null);
      this.pageError.set(apiMessage(error));
      this.revision.update((n) => n + 1);
    } finally {
      this.coordinatorBusyId.set(null);
    }
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les comptes. Réessayez dans un instant.');
  }

  protected clearSearch(): void {
    this.searchForm.q().reset('');
  }

  protected onChanged(): void {
    this.users.reload();
    this.totals.reload();
  }

  protected onSaved(user: UserDto): void {
    this.notice.set(`Compte de ${fullName(user)} enregistré.`);
    this.users.reload();
  }

  protected startEdit(user: UserDto): void {
    this.editing.set(user);
    this.editOpen.set(true);
  }

  protected startArchive(user: UserDto): void {
    if (!user.studentId) return;
    this.archiveTarget.set({ kind: 'student', studentId: user.studentId, name: fullName(user) });
    this.archiveOpen.set(true);
  }

  protected onArchived(count: number): void {
    this.notice.set(`${plural(count, 'compte archivé', 'comptes archivés')}.`);
    this.onChanged();
  }

  protected startDeactivate(user: UserDto): void {
    this.deactivating.set(user);
    this.actionError.set(null);
    this.deactivateOpen.set(true);
  }

  protected async deactivate(): Promise<void> {
    const user = this.deactivating();
    if (!user) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.#api.users.remove(user.id);
      this.deactivateOpen.set(false);
      this.notice.set(`Compte de ${fullName(user)} désactivé.`);
      this.users.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
