import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from '../core/auth/auth-store';
import { SCHOOL } from '../school';
import { Button, Icon, Wordmark } from '../ui';

interface NavItem {
  readonly label: string;
  readonly link: string;
  readonly exact?: boolean;
}

const PHONE = '+20 2 2590 47 40';

/**
 * The public site's frame: navy utility strip, the main header with the college's wordmark and the
 * navigation, and the footer. Prerendered; the sign-in state is read in the browser after hydration.
 */
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Wordmark, Icon, Button],
  template: `
    <a class="skip-link" href="#contenu">Aller au contenu</a>

    <header class="site-header">
      <div class="site-header__utility on-inverse">
        <div class="container">
          <a class="site-header__hide-sm" [href]="'tel:' + phoneHref">Standard {{ phone }}</a>
          <a class="site-header__hide-sm" [href]="'mailto:' + school.email">{{ school.email }}</a>
        </div>
      </div>
      <div class="site-header__main">
        <div class="container">
          <cdls-wordmark />
          <button
            #toggle
            cdlsButton
            variant="secondary"
            [iconOnly]="true"
            class="site-header__toggle"
            type="button"
            aria-controls="site-nav"
            [attr.aria-expanded]="menuOpen()"
            (click)="menuOpen.set(!menuOpen())"
          >
            <cdls-icon [name]="menuOpen() ? 'close' : 'menu'" /><span class="visually-hidden">Menu</span>
          </button>
          <nav id="site-nav" class="site-header__nav" aria-label="Navigation principale" [attr.data-open]="menuOpen() ? '' : null">
            <ul role="list">
              @for (item of nav; track item.link) {
                <li>
                  <a
                    class="nav-link"
                    [routerLink]="item.link"
                    routerLinkActive
                    [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                    ariaCurrentWhenActive="page"
                    >{{ item.label }}</a
                  >
                </li>
              }
            </ul>
            <a cdlsButton class="site-header__cta-sm" [routerLink]="accountLink()">{{ accountLabel() }}</a>
          </nav>
          <a cdlsButton variant="secondary" class="site-header__cta" [routerLink]="accountLink()">{{ accountLabel() }}</a>
        </div>
      </div>
    </header>

    <main id="contenu" tabindex="-1">
      <router-outlet />
    </main>

    <footer class="site-footer on-inverse">
      <div class="container">
        <div class="site-footer__grid">
          <div class="site-footer__about">
            <cdls-wordmark tone="dark" />
            <p>{{ school.tagline }} Bac nationale et Bac français, du jardin d’enfants à la Terminale.</p>
          </div>
          <nav aria-labelledby="f-college">
            <h2 id="f-college">Le collège</h2>
            <ul role="list">
              @for (item of nav.slice(1); track item.link) {
                <li><a [routerLink]="item.link">{{ item.label }}</a></li>
              }
            </ul>
          </nav>
          <nav aria-labelledby="f-espaces">
            <h2 id="f-espaces">Espaces</h2>
            <ul role="list">
              <li><a routerLink="/connexion">Espace élève</a></li>
              <li><a routerLink="/connexion">Espace enseignant</a></li>
              <li><a routerLink="/connexion">Administration</a></li>
            </ul>
          </nav>
          <div>
            <h2>Nous trouver</h2>
            <ul role="list">
              <li>{{ school.address }}</li>
              <li><a [href]="'tel:' + phoneHref">{{ phone }}</a></li>
              <li><a [href]="'mailto:' + school.email">{{ school.email }}</a></li>
            </ul>
          </div>
        </div>
        <div class="site-footer__legal">
          <p>© {{ year }} Collège de la Salle, Daher. Frères des Écoles chrétiennes.</p>
          <p>
            Photographies : archives lasalliennes (<a href="https://lasalle-po.org/" rel="noopener noreferrer">lasalle-po.org</a>)
            et collège (<a [href]="school.officialSite" rel="noopener noreferrer">lasalle-eg.net</a>), avec l’accord du collège.
          </p>
        </div>
      </div>
    </footer>
  `,
  host: { '(document:keydown.escape)': 'closeMenu()' },
})
export class PublicLayout {
  readonly #auth = inject(AuthStore);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  protected readonly school = SCHOOL;
  protected readonly phone = PHONE;
  protected readonly phoneHref = PHONE.replace(/\s/g, '');
  protected readonly year = 2026;
  protected readonly nav: readonly NavItem[] = [
    { label: 'Accueil', link: '/', exact: true },
    { label: 'Histoire', link: '/histoire' },
    { label: 'Bac nationale', link: '/bac-nationale' },
    { label: 'Bac français', link: '/bac-francais' },
    { label: 'Contact', link: '/contact' },
  ];
  protected readonly menuOpen = signal(false);
  protected readonly accountLabel = computed(() => (this.#auth.user() ? 'Mon espace' : 'Connexion'));
  protected readonly accountLink = computed(() => (this.#auth.user() ? this.#auth.home() : '/connexion'));

  constructor() {
    afterNextRender(() => void this.#auth.restore());
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    this.toggle().nativeElement.focus();
  }
}
