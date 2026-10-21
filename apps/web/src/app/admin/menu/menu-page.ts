import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { Icon } from '../../ui';
import { ADMIN_NAV } from '../admin.routes';

/** Every screen of the administration in one list: the phone's bottom bar only has room for five. */
@Component({
  selector: 'app-menu-page',
  imports: [RouterLink, Icon],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Toutes les pages</h1>
        <p class="t-muted">Les écrans de {{ isAdmin() ? 'l’administration' : 'la coordination' }}.</p>
      </div>
    </div>
    <ul class="list card card--panel" role="list">
      @for (item of items(); track item.path) {
        <li>
          <a class="list__main" [routerLink]="['..', item.path]"><span>{{ item.label }}</span><cdls-icon name="chevron-right" /></a>
        </li>
      }
    </ul>
  `,
  styles: `
    a.list__main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 2.75rem;
      color: var(--color-heading);
    }
  `,
})
export class MenuPage {
  readonly #auth = inject(AuthStore);
  protected readonly isAdmin = computed(() => this.#auth.role() === 'admin');
  protected readonly items = computed(() =>
    ADMIN_NAV.filter((item) => !item.mobileOnly && (item.access !== 'admin' || this.isAdmin())),
  );
}
