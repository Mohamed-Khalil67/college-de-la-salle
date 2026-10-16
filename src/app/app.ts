import { DOCUMENT, ViewportScroller } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SCHOOL, SUBJECTS } from '@site/content';
import { filter } from 'rxjs';

interface NavLink {
  readonly label: string;
  readonly link: string;
  readonly exact: boolean;
}

/** The site shell: French, left-to-right, standard header (brand left, navigation right). */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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
    ...SUBJECTS.map((s) => ({ label: s.navLabel, link: `/matiere/${s.slug}`, exact: false })),
  ];

  protected readonly menuOpen = signal(false);
  readonly #navigated = toSignal(this.#router.events.pipe(filter((e) => e instanceof NavigationEnd)));

  constructor() {
    // In-page links (« Sur cette page ») must land below the sticky header, not under it. The router's
    // anchor scrolling ignores CSS scroll-padding, so give it the header's height as an offset.
    const document = inject(DOCUMENT);
    inject(ViewportScroller).setOffset(() => [0, (document.querySelector('app-root > header')?.getBoundingClientRect().height ?? 0) + 16]);
    // Choosing a page closes the mobile menu.
    effect(() => {
      this.#navigated();
      this.menuOpen.set(false);
    });
  }
}
