import { Component, ElementRef, computed, effect, input, output, untracked, viewChildren } from '@angular/core';
import type { ClassDto, Role, UserDto } from '@cdls/shared';
import { Avatar, Badge, Button } from '../../../shared/ui';
import { formatLastLogin, fullName, sectionLabel, userStatus } from '../shared/admin-format';

let nextId = 0;

interface UserRow {
  readonly user: UserDto;
  readonly name: string;
  readonly className: string;
  readonly track: string;
  readonly status: ReturnType<typeof userStatus>;
  readonly lastLogin: string;
  readonly isSelf: boolean;
}

/** One page of accounts (port of the table in admin-utilisateurs.html). Stacked rows on phones. */
@Component({
  selector: 'app-users-table',
  imports: [Avatar, Badge, Button],
  template: `
    <div class="table-wrap" role="region" [attr.aria-labelledby]="captionId" tabindex="0">
      <table class="table table--stack">
        <caption [id]="captionId" class="visually-hidden">{{ caption() }}</caption>
        <thead>
          <tr>
            <th scope="col" aria-sort="ascending">Nom</th>
            @if (isStudents()) {
              <th scope="col">Classe</th>
              <th scope="col">Filière</th>
            }
            @if (isTeachers()) {
              <th scope="col">Coordinateur</th>
            }
            <th scope="col">Statut</th>
            <th scope="col">Dernière connexion</th>
            <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.user.id) {
            <tr>
              <th scope="row">
                <span class="person">
                  <cdls-avatar [name]="row.name" />
                  <span><span class="d-block">{{ row.name }}</span><span class="cell-sub">{{ row.user.email }}</span></span>
                </span>
              </th>
              @if (isStudents()) {
                <td data-label="Classe :">{{ row.className }}</td>
                <td data-label="Filière :">{{ row.track }}</td>
              }
              @if (isTeachers()) {
                <td data-label="Rôle :">
                  <label class="check">
                    <input
                      #coordinatorBox
                      type="checkbox"
                      [checked]="row.user.isCoordinator"
                      [attr.data-saved]="row.user.isCoordinator"
                      [attr.aria-disabled]="row.user.status !== 'active' || busyId() !== null ? 'true' : null"
                      (click)="onBoxClick($event, row.user)"
                    />
                    <span>Coordinateur<span class="visually-hidden"> : {{ row.name }}</span></span>
                  </label>
                </td>
              }
              <td data-label="Statut :"><cdls-badge [tone]="row.status.tone">{{ row.status.label }}</cdls-badge></td>
              <td class="t-muted" data-label="Dernière connexion :">{{ row.lastLogin }}</td>
              <td class="num">
                <span class="row-actions">
                  <button cdlsButton variant="tertiary" size="sm" type="button" (click)="edit.emit(row.user)">
                    Modifier<span class="visually-hidden"> le compte de {{ row.name }}</span>
                  </button>
                  @if (row.user.status === 'active' && !row.isSelf) {
                    <button cdlsButton variant="tertiary" size="sm" type="button" (click)="deactivate.emit(row.user)">
                      Désactiver<span class="visually-hidden"> le compte de {{ row.name }}</span>
                    </button>
                  }
                  @if (row.user.role === 'student' && row.user.status !== 'archived') {
                    <button cdlsButton variant="tertiary" size="sm" type="button" (click)="archive.emit(row.user)">
                      Diplômé ou parti<span class="visually-hidden"> : {{ row.name }}</span>
                    </button>
                  }
                </span>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-1);
    }
  `,
})
export class UsersTable {
  readonly users = input.required<readonly UserDto[]>();
  readonly role = input.required<Role>();
  readonly caption = input.required<string>();
  readonly classes = input<ReadonlyMap<string, ClassDto>>(new Map());
  readonly now = input.required<Date>();
  readonly selfId = input<string | null>(null);
  /** The teacher whose coordinateur flag is being saved. */
  readonly busyId = input<string | null>(null);
  /** Bumped by the page when a change was refused: the rows are drawn again from the data, so a box that flipped goes back. */
  readonly revision = input(0);
  readonly edit = output<UserDto>();
  readonly deactivate = output<UserDto>();
  /** A student who graduated or left the school. */
  readonly archive = output<UserDto>();
  /** The admin ticked or unticked « Coordinateur » for a teacher; `value` is the new state. */
  readonly coordinator = output<{ readonly user: UserDto; readonly value: boolean }>();

  constructor() {
    // A refused change: every box goes back to the saved state without drawing the rows again (focus stays).
    effect(() => {
      this.revision();
      untracked(() => {
        for (const ref of this.boxes()) ref.nativeElement.checked = ref.nativeElement.dataset['saved'] === 'true';
      });
    });
  }

  protected readonly captionId = `users-caption-${++nextId}`;
  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('coordinatorBox');
  protected readonly isStudents = computed(() => this.role() === 'student');
  protected readonly isTeachers = computed(() => this.role() === 'teacher');
  /**
   * The box flips at once. While any change is being saved, or for an account that is not active, the click is
   * ignored (`aria-disabled`, not `disabled`: focus stays on the box).
   */
  protected onBoxClick(event: Event, user: UserDto): void {
    const box = event.target as HTMLInputElement;
    if (box.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      return;
    }
    this.coordinator.emit({ user, value: box.checked });
  }

  protected readonly rows = computed<UserRow[]>(() =>
    this.users().map((user) => {
      const schoolClass = user.classId ? this.classes().get(user.classId) : undefined;
      return {
        user,
        name: fullName(user),
        className: schoolClass?.label ?? 'Sans classe',
        track: schoolClass ? sectionLabel(schoolClass.sectionCode) : '—',
        status: userStatus(user),
        lastLogin: formatLastLogin(user.lastLoginAt, this.now()),
        isSelf: user.id === this.selfId(),
      };
    }),
  );
}
