import { DOCUMENT, ViewportScroller } from '@angular/common';
import { Component, afterNextRender, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SCHOOL } from '@site/content';
import { StudentService } from '@site/student';
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
    { label: 'Section nationale', link: '/section-nationale', exact: false },
    { label: 'Bac français', link: '/bac', exact: false },
    { label: 'Contact', link: '/contact', exact: false },
  ];

  protected readonly student = inject(StudentService);
  protected readonly menuOpen = signal(false);
  readonly #navigated = toSignal(this.#router.events.pipe(filter((e) => e instanceof NavigationEnd)));

  constructor() {
    // In-page links (« Sur cette page ») must land below the sticky header, not under it. The router's
    // anchor scrolling ignores CSS scroll-padding, so give it the header's height as an offset.
    const document = inject(DOCUMENT);
    inject(ViewportScroller).setOffset(() => [0, (document.querySelector('app-root > header')?.getBoundingClientRect().height ?? 0) + 16]);
    // Sign-in state is loaded after the first render, in the browser only (Firebase is not part of the
    // prerendered pages or the initial bundle).
    afterNextRender(() => void this.student.init());
    // Choosing a page closes the mobile menu.
    effect(() => {
      this.#navigated();
      this.menuOpen.set(false);
    });
  }
}
