import { DOCUMENT } from '@angular/common';
import { Component, Service, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'exam-platform:theme';

/**
 * Light (Andalusian ivory) / dark (night) theme. Starts from the device preference, then
 * remembers the person's own choice. Applied as `data-theme` on <html>, which styles.scss keys on.
 */
@Service()
export class ThemeService {
  readonly #document = inject(DOCUMENT);
  readonly #mode = signal<ThemeMode>(this.#initial());
  readonly mode = this.#mode.asReadonly();
  readonly isDark = computed(() => this.#mode() === 'dark');

  constructor() {
    effect(() => {
      this.#document.documentElement.setAttribute('data-theme', this.#mode());
    });
  }

  toggle(): void {
    const next: ThemeMode = this.#mode() === 'dark' ? 'light' : 'dark';
    this.#mode.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice lasts for this visit */
    }
  }

  #initial(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* ignore */
    }
    return this.#document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
}

/** Sun / moon toggle for the header. */
@Component({
  selector: 'exam-theme-toggle',
  template: `
    <button
      type="button"
      class="theme-toggle"
      [attr.aria-pressed]="theme.isDark()"
      [attr.aria-label]="theme.isDark() ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'"
      [attr.title]="theme.isDark() ? 'الوضع النهاري' : 'الوضع الليلي'"
      (click)="theme.toggle()"
    >
      <span aria-hidden="true">{{ theme.isDark() ? '☀' : '☾' }}</span>
      <span class="label">{{ theme.isDark() ? 'نهاري' : 'ليلي' }}</span>
    </button>
  `,
  styles: `
    .theme-toggle { padding-block: 0.3rem; padding-inline: 0.75rem; font-size: 0.9rem; gap: 0.35rem; border-radius: 999px; }
    .theme-toggle span[aria-hidden] { font-size: 1.05rem; color: var(--gold); }
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
