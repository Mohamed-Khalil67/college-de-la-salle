import { Component, computed, input, output } from '@angular/core';
import type { ClassDto, Role, UserDto } from '@cdls/shared';
import { Avatar, Badge, Button } from '../../ui';
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
              <td data-label="Statut :"><cdls-badge [tone]="row.status.tone">{{ row.status.label }}</cdls-badge></td>
              <td class="t-muted" data-label="Dernière connexion :">{{ row.lastLogin }}</td>
              <td class="num">
                <span class="row-actions">
                  <button cdlsButton variant="tertiary" size="sm" type="button" (click)="edit.emit(row.user)">
                    Modifier<span class="visually-hidden"> le compte de {{ row.name }}</span>
                  </button>
                  @if (row.user.isActive && !row.isSelf) {
                    <button cdlsButton variant="tertiary" size="sm" type="button" (click)="deactivate.emit(row.user)">
                      Désactiver<span class="visually-hidden"> le compte de {{ row.name }}</span>
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
  readonly edit = output<UserDto>();
  readonly deactivate = output<UserDto>();

  protected readonly captionId = `users-caption-${++nextId}`;
  protected readonly isStudents = computed(() => this.role() === 'student');
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
