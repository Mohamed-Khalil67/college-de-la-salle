import { DOCUMENT, NgOptimizedImage, ViewportScroller } from '@angular/common';
import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
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
})
export class App {
  readonly #router = inject(Router);

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
      .subscribe(() => this.menuOpen.set(false));
  }
}
