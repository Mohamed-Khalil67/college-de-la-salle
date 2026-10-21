import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from '../core/auth/auth-store';
import { Avatar, Icon, Wordmark } from '../ui';
import { ChangePasswordModal } from './change-password-modal';
import { type SpaceNavItem, visibleNav } from './space-nav';

export type { SpaceNavItem } from './space-nav';

/**
 * The frame of the student, teacher and admin spaces: navy app bar with the area's navigation, the
 * account menu (sign out), and a bottom bar on phones. Each area passes its navigation in route data.
 */
@Component({
  selector: 'app-space-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Wordmark, Icon, Avatar, ChangePasswordModal],
  template: `
    <div class="has-bottom-nav">
      <a class="skip-link" href="#contenu">Aller au contenu</a>

      <header class="app-bar on-inverse">
        <div class="app-bar__inner">
          <cdls-wordmark tone="dark" [subtitle]="area()" [link]="base()" [label]="'Collège de la Salle, ' + area() + ' : accueil'" />
          <p class="app-bar__title" aria-hidden="true">{{ pageTitle() }}</p>
          <nav class="app-bar__nav" [attr.aria-label]="area()">
            <ul role="list">
              @for (item of desktopNav(); track item.path) {
                <li>
                  <a
                    class="nav-link"
                    [routerLink]="link(item)"
                    routerLinkActive
                    [routerLinkActiveOptions]="{ exact: item.path === '' }"
                    ariaCurrentWhenActive="page"
                    >{{ item.label }}</a
                  >
                </li>
              }
            </ul>
          </nav>
          <div class="app-bar__end account">
            <button
              #accountButton
              type="button"
              class="app-bar__account"
              aria-controls="account-menu"
              [attr.aria-expanded]="accountOpen()"
              (click)="accountOpen.set(!accountOpen())"
            >
              <cdls-avatar [name]="auth.displayName()" [gold]="true" />
              <span class="app-bar__account-text">{{ auth.displayName() }}<small>{{ roleLabel() }}</small></span>
              <span class="visually-hidden">Compte de {{ auth.displayName() }}</span>
              <cdls-icon name="chevron-down" />
            </button>
            @if (accountOpen()) {
              <div id="account-menu" class="account-menu">
                <p class="account-menu__who">{{ auth.user()?.email }}</p>
                @if (auth.role() === 'student') {
                  <a class="account-menu__item" routerLink="/eleve/section"><cdls-icon name="book" /> Ma section</a>
                }
                <button type="button" class="account-menu__item" (click)="openPassword()">
                  <cdls-icon name="edit" /> Changer mon mot de passe
                </button>
                <button type="button" class="account-menu__item" (click)="logout()">
                  <cdls-icon name="log-out" /> Se déconnecter
                </button>
              </div>
            }
          </div>
        </div>
      </header>

      <main id="contenu" class="page" tabindex="-1">
        <router-outlet />
      </main>

      <app-change-password-modal [(open)]="passwordOpen" />

      <nav class="bottom-nav" aria-label="Navigation mobile">
        <ul role="list">
          @for (item of mobileNav(); track item.path) {
            <li>
              <a [routerLink]="link(item)" routerLinkActive [routerLinkActiveOptions]="{ exact: item.path === '' }" ariaCurrentWhenActive="page">
                <cdls-icon [name]="item.icon ?? 'more'" />{{ item.short ?? item.label }}
              </a>
            </li>
          }
        </ul>
      </nav>
    </div>
  `,
  styles: `
    .account {
      position: relative;
    }
    .app-bar__account {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .account-menu {
      position: absolute;
      inset-inline-end: 0;
      top: calc(100% + var(--space-2));
      z-index: 40;
      min-width: 16rem;
      padding: var(--space-2);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-body);
      box-shadow: var(--shadow-overlay);
    }
    .account-menu__who {
      padding: var(--space-2) var(--space-3);
      color: var(--color-muted);
      font-size: var(--text-body-s);
      overflow-wrap: anywhere;
    }
    .account-menu__item {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      width: 100%;
      min-height: 2.75rem;
      padding: var(--space-2) var(--space-3);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-heading);
      font: inherit;
      cursor: pointer;
    }
    a.account-menu__item {
      text-decoration: none;
    }
    .account-menu__item:hover {
      background: var(--color-subtle);
    }
  `,
  host: { '(document:keydown.escape)': 'closeAccount()', '(document:click)': 'onDocumentClick($event)' },
})
export class SpaceLayout {
  /** From route data. */
  readonly areaLabel = input('Espace');
  /** Shown instead of `areaLabel` to a teacher who is a coordinateur (in the administration). */
  readonly coordinatorAreaLabel = input<string | null>(null);
  readonly nav = input<readonly SpaceNavItem[]>([]);

  protected readonly auth = inject(AuthStore);
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  private readonly accountButton = viewChild.required<ElementRef<HTMLButtonElement>>('accountButton');

  protected readonly accountOpen = signal(false);
  protected readonly passwordOpen = signal(false);
  protected readonly base = computed(() => '/' + (this.#route.snapshot.pathFromRoot.flatMap((r) => r.url.map((s) => s.path)).join('/') || ''));
  protected readonly area = computed(() =>
    this.auth.role() === 'teacher' && this.coordinatorAreaLabel() ? (this.coordinatorAreaLabel() ?? '') : this.areaLabel(),
  );
  /** The items this user may see: admin-only and coordinator-only entries are filtered by role. */
  protected readonly visibleNav = computed(() => visibleNav(this.nav(), this.auth.user()));
  protected readonly desktopNav = computed(() => this.visibleNav().filter((item) => !item.mobileOnly));
  /** At most five icons in the bottom bar: when there are more, the last entry (« Plus », « Coordination ») keeps its place. */
  protected readonly mobileNav = computed(() => {
    const items = this.visibleNav().filter((item) => item.icon);
    return items.length > 5 ? [...items.slice(0, 4), items[items.length - 1]] : items;
  });
  protected readonly roleLabel = computed(() => {
    switch (this.auth.role()) {
      case 'student':
        return 'Élève';
      case 'teacher':
        return 'Enseignant';
      case 'admin':
        return 'Administration';
      default:
        return '';
    }
  });

  /** The current page's title, shown in the app bar on phones (where the navigation moves to the bottom bar). */
  protected readonly pageTitle = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.#deepestTitle()),
    ),
    { initialValue: this.#deepestTitle() },
  );

  constructor() {
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.accountOpen.set(false));
  }

  protected link(item: SpaceNavItem): string {
    if (item.href) return item.href;
    return item.path ? `${this.base()}/${item.path}` : this.base();
  }

  protected openPassword(): void {
    this.accountOpen.set(false);
    this.passwordOpen.set(true);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.#router.navigateByUrl('/connexion');
  }

  protected closeAccount(): void {
    if (!this.accountOpen()) return;
    this.accountOpen.set(false);
    this.accountButton().nativeElement.focus();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.accountOpen() && !(event.target as HTMLElement).closest('.account')) this.accountOpen.set(false);
  }

  #deepestTitle(): string {
    let route = this.#router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.title ?? this.areaLabel();
  }
}
