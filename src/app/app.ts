import { DOCUMENT, NgOptimizedImage, ViewportScroller } from '@angular/common';
import { Component, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SCHOOL } from '@site/content';
import { SpaceService } from '@site/space';
import { filter } from 'rxjs';

interface NavLink {
  readonly label: string;
  readonly link: string;
  readonly exact: boolean;
}

/** The site shell: French, left-to-right, standard header (brand left, navigation right). */
@Component({
  selector: 'app-root',
  imports: [NgOptimizedImage, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown)': 'onKeydown($event)', '(document:click)': 'onDocumentClick($event)' },
})
export class App {
  readonly #router = inject(Router);
  readonly #host = inject(ElementRef<HTMLElement>);

  protected readonly school = SCHOOL;
  protected readonly year = 1898;
  protected readonly nav: readonly NavLink[] = [
    { label: 'Accueil', link: '/', exact: true },
    { label: 'Histoire & Patrimoine', link: '/histoire', exact: false },
    { label: 'Bac nationale', link: '/bac-nationale', exact: false },
    { label: 'Bac français', link: '/bac-francais', exact: false },
    { label: 'Contact', link: '/contact', exact: false },
  ];

  protected readonly space = inject(SpaceService);
  /** Label of the student pill: the first name once signed in as a student. */
  protected readonly studentLabel = computed(() => {
    const name = this.space.role() === 'student' ? this.space.firstName() : null;
    return name ? 'Mon espace · ' + name : 'Espace élève';
  });
  protected readonly teacherLabel = computed(() => (this.space.role() === 'teacher' ? 'Mon espace enseignant' : 'Espace enseignant'));
  protected readonly menuOpen = signal(false);
  protected readonly accountOpen = signal(false);
  /** The pill: « Se connecter » for a visitor, the person's space once signed in. */
  protected readonly accountLabel = computed(() => {
    const role = this.space.role();
    if (role === 'student' && this.space.firstName()) return 'Mon espace · ' + this.space.firstName();
    if (role === 'teacher') return 'Mon espace enseignant';
    return 'Se connecter';
  });

  /** Escape closes the account menu (and returns focus to its pill); a click elsewhere closes it too. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.accountOpen()) return;
    this.accountOpen.set(false);
    (this.#host.nativeElement as HTMLElement).querySelector<HTMLElement>('.account-button')?.focus();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.accountOpen() && !(event.target as HTMLElement).closest('.account')) this.accountOpen.set(false);
  }

  constructor() {
    // In-page links (« Sur cette page ») must land below the sticky header, not under it. The router's
    // anchor scrolling ignores CSS scroll-padding, so give it the header's height as an offset.
    const document = inject(DOCUMENT);
    inject(ViewportScroller).setOffset(() => [0, (document.querySelector('app-root > header')?.getBoundingClientRect().height ?? 0) + 16]);
    // Sign-in state is loaded after the first render, in the browser only (Firebase is not part of the
    // prerendered pages or the initial bundle).
    afterNextRender(() => void this.space.init());
    // Choosing a page closes the mobile menu. (A subscription, not an effect: an effect also runs once at
    // startup and would close a menu the visitor opened before hydration finished.)
    this.#router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        this.accountOpen.set(false);
      });
  }
}
