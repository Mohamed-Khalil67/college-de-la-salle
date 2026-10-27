import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from '../core/auth/auth-store';
import { LOCALE, readPublicRoute } from '../i18n/locale';
import { pageUrl, type PublicPageId } from '../i18n/pages';
import { SCHOOL } from '../school';
import { Button, Icon, SkipLink, Wordmark } from '../shared/ui';
import { LanguageSwitcher } from './language-switcher';

type NavPage = 'home' | 'history' | 'nationale' | 'bac' | 'contact';

interface NavItem {
  readonly label: string;
  readonly link: string;
  readonly exact: boolean;
}

const PHONE = '+20 2 2590 47 40';
const NAV_PAGES: readonly NavPage[] = ['home', 'history', 'nationale', 'bac', 'contact'];

/**
 * The public site's frame, in the route's language (LOCALE): navy utility strip with the language switcher,
 * the main header with the college's wordmark and the navigation, and the footer. Prerendered; the sign-in
 * state is read in the browser after hydration.
 */
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Wordmark, Icon, Button, SkipLink, LanguageSwitcher],
  template: `
    <a cdlsSkipLink>{{ t.layout.skipToContent }}</a>

    <header class="site-header">
      <div class="site-header__utility on-inverse">
        <div class="container">
          <a class="site-header__hide-sm" [href]="'tel:' + phoneHref"
            >{{ t.layout.switchboard }} <span class="phone-number">{{ phone }}</span></a
          >
          <a class="site-header__hide-sm" [href]="'mailto:' + school.email">{{ school.email }}</a>
          <nav siteLanguages class="site-header__languages" [current]="lang" [page]="page()" [label]="t.layout.languages"></nav>
        </div>
      </div>
      <div class="site-header__main">
        <div class="container">
          <cdls-wordmark [link]="homeLink" [subtitle]="content.school.place" />
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
            <cdls-icon [name]="menuOpen() ? 'close' : 'menu'" /><span class="visually-hidden">{{ t.layout.menu }}</span>
          </button>
          <nav id="site-nav" class="site-header__nav" [attr.aria-label]="t.layout.mainNav" [attr.data-open]="menuOpen() ? '' : null">
            <ul role="list">
              @for (item of nav; track item.link) {
                <li>
                  <a
                    class="nav-link"
                    [routerLink]="item.link"
                    routerLinkActive
                    [routerLinkActiveOptions]="{ exact: item.exact }"
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
            <cdls-wordmark tone="dark" [link]="homeLink" [subtitle]="content.school.place" />
            <p>{{ content.school.tagline }} {{ t.layout.footerAbout }}</p>
          </div>
          <nav aria-labelledby="f-college">
            <h2 id="f-college">{{ t.layout.footerCollege }}</h2>
            <ul role="list">
              @for (item of nav.slice(1); track item.link) {
                <li><a [routerLink]="item.link">{{ item.label }}</a></li>
              }
            </ul>
          </nav>
          <nav aria-labelledby="f-espaces">
            <h2 id="f-espaces">{{ t.layout.footerSpaces }}</h2>
            <ul role="list">
              <li><a [routerLink]="loginLink">{{ t.layout.studentSpace }}</a></li>
              <li><a [routerLink]="loginLink">{{ t.layout.teacherSpace }}</a></li>
              <li><a [routerLink]="loginLink">{{ t.layout.administration }}</a></li>
            </ul>
          </nav>
          <div>
            <h2>{{ t.layout.findUs }}</h2>
            <ul role="list">
              <li>{{ content.school.address }}</li>
              <li><a class="phone-number" [href]="'tel:' + phoneHref">{{ phone }}</a></li>
              <li><a [href]="'mailto:' + school.email">{{ school.email }}</a></li>
            </ul>
          </div>
        </div>
        <div class="site-footer__legal">
          <p>{{ t.layout.copyright(year) }}</p>
          <p>
            {{ t.layout.photoCredits.before }}<a href="https://lasalle-po.org/" rel="noopener noreferrer">lasalle-po.org</a
            >{{ t.layout.photoCredits.middle }}<a [href]="school.officialSite" rel="noopener noreferrer">lasalle-eg.net</a
            >{{ t.layout.photoCredits.after }}
          </p>
          <p><a [routerLink]="accessibilityLink">{{ t.layout.accessibility }}</a></p>
        </div>
      </div>
    </footer>
  `,
  styles: `
    .site-header__languages {
      margin-inline-start: auto;
    }
  `,
  host: { '(document:keydown.escape)': 'closeMenu()' },
})
export class PublicLayout {
  readonly #auth = inject(AuthStore);
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #locale = inject(LOCALE);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  protected readonly lang = this.#locale.lang;
  protected readonly t = this.#locale.messages;
  protected readonly content = this.#locale.content;
  protected readonly school = SCHOOL;
  protected readonly phone = PHONE;
  protected readonly phoneHref = PHONE.replace(/\s/g, '');
  protected readonly year = 2026;
  protected readonly homeLink = pageUrl(this.lang, 'home');
  protected readonly loginLink = pageUrl(this.lang, 'login');
  protected readonly accessibilityLink = pageUrl(this.lang, 'accessibility');
  protected readonly nav: readonly NavItem[] = NAV_PAGES.map((page) => ({
    label: this.t.layout.nav[page],
    link: pageUrl(this.lang, page),
    exact: page === 'home',
  }));
  /** The page shown, so the language switcher links to the same page in the other languages. */
  protected readonly page = signal<PublicPageId>(this.#currentPage());
  protected readonly menuOpen = signal(false);
  protected readonly accountLabel = computed(() => (this.#auth.user() ? this.t.layout.mySpace : this.t.layout.signIn));
  protected readonly accountLink = computed(() => (this.#auth.user() ? this.#auth.home() : this.loginLink));

  constructor() {
    afterNextRender(() => void this.#auth.restore());
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        this.page.set(this.#currentPage());
      });
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    this.toggle().nativeElement.focus();
  }

  #currentPage(): PublicPageId {
    return readPublicRoute(this.#route.snapshot)?.page ?? 'home';
  }
}
