import { Dir } from '@angular/cdk/bidi';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '@exam/data-access-auth';
import { CurriculumStore } from '@exam/data-access-curriculum';
import { SchoolName } from '@exam/feature-portal';
import { Frieze, ThemeToggle } from '@exam/ui-arabic';
import { NavMenu, type NavMenuItem } from './shell/nav-menu';

@Component({
  selector: 'app-root',
  // `Dir` provides CDK `Directionality` = 'rtl' to the whole tree, so any CDK overlay, menu or
  // drag-drop added later mirrors correctly without per-component configuration.
  imports: [Dir, RouterOutlet, RouterLink, RouterLinkActive, Frieze, ThemeToggle, NavMenu, SchoolName],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthStore);
  protected readonly curriculum = inject(CurriculumStore);
  readonly #router = inject(Router);

  protected readonly aboutMenu: readonly NavMenuItem[] = [
    { label: 'تاريخ المدرسة', link: '/about/history' },
    { label: 'الأخبار', link: '/about/news' },
    { label: 'معرض الصور', link: '/about/gallery' },
  ];

  protected readonly sectionsMenu: readonly NavMenuItem[] = [
    { label: 'القسم العربي', link: '/sections/arabic' },
  ];

  protected readonly subjectsMenu = computed<readonly NavMenuItem[]>(() =>
    this.curriculum.subjects().map((s) => ({ label: s.name, link: `/subjects/${s.id}` })),
  );

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.#router.navigateByUrl('/');
  }
}
