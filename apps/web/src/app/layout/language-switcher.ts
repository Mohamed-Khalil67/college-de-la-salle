import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LANG_META, LANGS, type Lang } from '../i18n/lang';
import { pageUrl, type PublicPageId } from '../i18n/pages';

/**
 * `<nav siteLanguages [current]="…" [page]="…" label="…">`: the same page in the other languages. Each name
 * is written in its own language (and marked with `lang`, so a screen reader pronounces it right); the
 * current one is `aria-current`.
 */
@Component({
  selector: 'nav[siteLanguages]',
  imports: [RouterLink],
  host: { class: 'lang-switch', '[class.lang-switch--light]': 'tone() === "light"', '[attr.aria-label]': 'label()' },
  template: `
    <ul role="list">
      @for (l of links(); track l.lang) {
        <li>
          <a
            [routerLink]="l.url"
            [attr.lang]="l.lang"
            [attr.hreflang]="l.lang"
            [attr.aria-current]="l.current ? 'true' : null"
            >{{ l.name }}</a
          >
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      display: flex;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
    }
    a {
      display: inline-flex;
      align-items: center;
      min-height: 2.25rem;
      padding-inline: var(--space-2);
      border-radius: var(--radius-sm);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    a[aria-current] {
      color: var(--color-accent);
      font-weight: 600;
      text-decoration: underline;
      text-decoration-thickness: 2px;
      text-underline-offset: 0.3em;
    }
    :host(.lang-switch--light) a[aria-current] {
      color: var(--color-accent-text);
    }
    a[lang='ar'] {
      font-family: var(--font-arabic);
    }
  `,
})
export class LanguageSwitcher {
  readonly current = input.required<Lang>();
  readonly page = input.required<PublicPageId>();
  readonly label = input.required<string>();
  /** `light` on the ivory pages (the sign-in page), `dark` in the navy utility strip. */
  readonly tone = input<'dark' | 'light'>('dark');

  protected readonly links = computed(() =>
    LANGS.map((lang) => ({
      lang,
      name: LANG_META[lang].endonym,
      url: pageUrl(lang, this.page()),
      current: lang === this.current(),
    })),
  );
}
