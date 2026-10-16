import { Dir } from '@angular/cdk/bidi';
import { Component, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '@exam/data-access-auth';
import { ContentStore } from '@exam/data-access-curriculum';
import { SchoolName, TeacherBar } from '@exam/feature-portal';
import { PageLanguage, ThemeToggle } from '@exam/ui-arabic';

interface NavLink {
  readonly label: string;
  readonly link: string;
  /** Language of the label itself: French destinations keep their French name in the Arabic bar. */
  readonly lang: 'ar' | 'fr';
  readonly exact?: boolean;
}

/** Flat primary navigation (no nested menus). */
const NAV: readonly NavLink[] = [
  { label: 'الرئيسية', link: '/', lang: 'ar', exact: true },
  { label: 'عن المدرسة وتاريخها', link: '/ar/histoire', lang: 'ar' },
  { label: 'اللغة العربية', link: '/ar/matiere/arabe', lang: 'ar' },
  { label: 'Mathématiques', link: '/fr/matiere/mathematiques', lang: 'fr' },
  { label: 'Physique-Chimie', link: '/fr/matiere/physique-chimie', lang: 'fr' },
  { label: 'بنك الامتحانات', link: '/exams', lang: 'ar' },
];

@Component({
  selector: 'app-root',
  // `Dir` gives the CDK `Directionality` of the current page (RTL for Arabic, LTR for French) to
  // the whole tree, so overlays, menus and drag-drop mirror correctly without extra configuration.
  imports: [Dir, RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle, SchoolName, TeacherBar],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthStore);
  protected readonly pageLang = inject(PageLanguage);
  readonly #router = inject(Router);
  readonly #content = inject(ContentStore);

  protected readonly nav = NAV;
  readonly #navigated = toSignal(this.#router.events.pipe(filter((e) => e instanceof NavigationEnd)));
  protected readonly menuOpen = signal(false);
  /** Current path, so «Mode Enseignant» brings a teacher back to the page they were reading. */
  protected readonly here = computed(() => {
    this.#navigated();
    return this.#router.url.split(/[?#]/)[0] || '/';
  });
  protected readonly fr = computed(() => this.pageLang.lang() === 'fr');

  constructor() {
    // Public pages are prerendered from bundled content; once the page is interactive, start the
    // live content listener (browser only). Teacher edits then appear for everyone.
    afterNextRender(() => void this.#content.connect());
    // A selected link closes the mobile menu.
    effect(() => {
      this.#navigated();
      this.menuOpen.set(false);
    });
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.#router.navigateByUrl('/');
  }
}
