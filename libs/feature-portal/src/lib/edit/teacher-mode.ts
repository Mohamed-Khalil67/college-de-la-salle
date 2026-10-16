import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, Service, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '@exam/data-access-auth';
import { ContentStore } from '@exam/data-access-curriculum';
import { PageLanguage } from '@exam/ui-arabic';

const STORAGE_KEY = 'lasalle:teacher-mode';

/**
 * «Mode Enseignant»: whether inline editing is switched on. Only teachers (the `teacher` claim) can
 * enable it, and the choice survives reloads within the browser session. Purely a UI switch — the
 * Firestore rules are what actually decide who may write.
 */
@Service()
export class TeacherMode {
  readonly #auth = inject(AuthStore);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #on = signal(this.#restore());

  /** Signed in as a teacher: the toggle is shown. */
  readonly available = this.#auth.isTeacher;
  /** Editing is on: «Modifier» triggers are shown on every editable section. */
  readonly enabled = computed(() => this.#on() && this.#auth.isTeacher());

  constructor() {
    effect(() => {
      const on = this.#on();
      if (!this.#browser) return;
      try {
        sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0');
      } catch {
        /* storage unavailable: the switch still works for this page view */
      }
    });
  }

  toggle(): void {
    this.#on.update((on) => !on);
  }

  #restore(): boolean {
    if (!this.#browser) return false;
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}

/** Floating «Mode Enseignant» switch, visible to signed-in teachers on every page. */
@Component({
  selector: 'portal-teacher-bar',
  imports: [RouterLink],
  template: `
    @if (mode.available()) {
      <aside
        class="fixed bottom-4 end-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-xl border border-gold bg-navy-900 p-3 text-cream shadow-lg"
        [attr.aria-label]="lang.lang() === 'fr' ? 'Mode Enseignant' : 'وضع المعلّم'"
        data-testid="teacher-bar"
        [attr.lang]="lang.lang()"
      >
        <button
          type="button"
          role="switch"
          class="teacher-switch flex items-center gap-3 rounded-lg px-1 py-1 text-start font-semibold"
          [attr.aria-checked]="mode.enabled()"
          (click)="mode.toggle()"
        >
          <span
            class="relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors"
            [class.bg-gold]="mode.enabled()"
            [class.bg-navy-700]="!mode.enabled()"
            aria-hidden="true"
          >
            <span
              class="absolute top-0.5 size-5 rounded-full bg-cream transition-all"
              [class.start-5]="mode.enabled()"
              [class.start-0.5]="!mode.enabled()"
            ></span>
          </span>
          <span lang="fr" dir="ltr">Mode Enseignant</span>
        </button>
        <p class="m-0 text-sm" role="status" aria-live="polite" data-testid="save-status">
          @switch (content.status()) {
            @case ('saving') {
              {{ lang.lang() === 'fr' ? 'Enregistrement…' : 'جارٍ الحفظ…' }}
            }
            @case ('saved') {
              ✓ {{ lang.lang() === 'fr' ? 'Enregistré' : 'تم الحفظ' }}
            }
            @case ('error') {
              {{ lang.lang() === 'fr' ? "Échec de l'enregistrement" : 'تعذَّر الحفظ' }}
            }
            @default {
              {{ mode.enabled() ? (lang.lang() === 'fr' ? 'Cliquez sur « Modifier » dans une section.' : 'اضغط «تعديل» في أي قسم.') : '' }}
            }
          }
        </p>
        <a routerLink="/examiner" class="text-sm text-gold underline underline-offset-4">
          {{ lang.lang() === 'fr' ? 'Tableau de bord des examens' : 'لوحة الامتحانات' }}
        </a>
      </aside>
    }
  `,
  styles: `
    .teacher-switch { background: none; border: 0; color: inherit; padding: 0.25rem; }
    .teacher-switch:hover:not(:disabled) { background: none; }
    a { color: var(--gold); }
  `,
})
export class TeacherBar {
  protected readonly mode = inject(TeacherMode);
  protected readonly content = inject(ContentStore);
  protected readonly lang = inject(PageLanguage);
}
