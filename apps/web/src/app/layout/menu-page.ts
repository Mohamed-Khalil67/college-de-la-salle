import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../core/auth/auth-store';
import { Icon } from '../ui';
import { type SpaceNavItem, visibleNav } from './space-nav';

/**
 * « Plus »: every screen of the current area in one list, because the phone's bottom bar only has room for
 * five. The same page serves /eleve/menu, /enseignant/menu and /admin/menu; the navigation comes from the
 * area's route data, like the layout's.
 */
@Component({
  selector: 'app-menu-page',
  imports: [RouterLink, Icon],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Toutes les pages</h1>
        <p class="t-muted">{{ area() }}</p>
      </div>
    </div>
    <ul class="list card card--panel" role="list">
      @for (item of items(); track item.path) {
        <li>
          <a class="list__main" [routerLink]="link(item)"><span>{{ item.label }}</span><cdls-icon name="chevron-right" /></a>
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
  readonly #route = inject(ActivatedRoute);
  readonly #nav = this.#find<readonly SpaceNavItem[]>('nav') ?? [];
  readonly #base = '/' + this.#route.snapshot.pathFromRoot.flatMap((r) => r.url.map((s) => s.path)).slice(0, 1).join('/');

  protected readonly items = computed(() => visibleNav(this.#nav, this.#auth.user()).filter((item) => !item.mobileOnly));
  protected readonly area = computed(() => {
    const role = this.#auth.role();
    if (role === 'admin') return 'Les écrans de l’administration.';
    if (this.#base === '/admin') return 'Les écrans de la coordination.';
    return role === 'teacher' ? 'Les pages de votre espace enseignant.' : 'Les pages de votre espace.';
  });

  protected link(item: SpaceNavItem): string {
    if (item.href) return item.href;
    return item.path ? `${this.#base}/${item.path}` : this.#base;
  }

  #find<T>(key: string): T | undefined {
    for (const route of [...this.#route.snapshot.pathFromRoot].reverse()) {
      if (route.data[key] !== undefined) return route.data[key] as T;
    }
    return undefined;
  }
}
