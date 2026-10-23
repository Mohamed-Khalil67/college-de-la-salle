import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../i18n/locale';
import { pageUrl } from '../../i18n/pages';
import { Icon } from '../../ui';

/**
 * `<section siteAudiences>`: « Vous êtes… », right under the hero. Three doors, one per visitor (future family,
 * student, teacher), each going straight to where that person starts. The whole item is the link's target
 * (the title's link stretches over it); the chevron points the reading direction.
 */
@Component({
  selector: 'section[siteAudiences]',
  imports: [RouterLink, Icon],
  host: { class: 'audiences', 'aria-labelledby': 'audiences-title' },
  template: `
    <div class="container audiences__inner">
      <h2 id="audiences-title" class="t-h2 audiences__title">{{ t.audienceTitle }}</h2>
      <ul class="audiences__list" role="list">
        @for (a of audiences; track a.id) {
          <li class="audiences__item">
            <h3 class="t-h3">
              <a class="audiences__link" [routerLink]="a.link">{{ a.title }}</a>
            </h3>
            <p class="t-body-s t-muted">{{ a.text }}</p>
            <cdls-icon class="flip-rtl" name="chevron-right" />
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    :host {
      display: block;
      border-block-end: 1px solid var(--color-line);
      background: var(--color-page);
    }
    .audiences__inner {
      display: grid;
      gap: var(--space-4);
      padding-block: var(--space-8);
    }
    .audiences__title {
      margin: 0;
    }
    .audiences__list {
      display: grid;
      margin: 0;
      padding: 0;
    }
    .audiences__item {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: var(--space-4);
      align-items: center;
      padding-block: var(--space-4);
      border-block-start: 1px solid var(--color-line);
    }
    .audiences__item > :not(cdls-icon) {
      grid-column: 1;
      margin: 0;
    }
    .audiences__item cdls-icon {
      grid-column: 2;
      grid-row: 1 / span 2;
      color: var(--color-accent-text);
    }
    .audiences__link {
      color: var(--color-heading);
      text-decoration: none;
    }
    .audiences__link::after {
      content: '';
      position: absolute;
      inset: 0;
    }
    .audiences__item:hover .audiences__link {
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }
    .audiences__link:focus-visible {
      outline: none;
    }
    .audiences__link:focus-visible::after {
      border-radius: var(--radius-sm);
      box-shadow: var(--focus-ring);
    }
    @media (min-width: 56.0625rem) {
      .audiences__inner {
        grid-template-columns: 11rem minmax(0, 1fr);
        align-items: center;
        gap: var(--space-8);
      }
      .audiences__list {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .audiences__item {
        padding-block: var(--space-2);
        padding-inline: var(--space-6);
        border-block-start: 0;
        border-inline-start: 1px solid var(--color-line);
      }
    }
  `,
})
export class AudienceLinks {
  readonly #locale = inject(LOCALE);
  protected readonly t = this.#locale.messages.home;
  protected readonly audiences = this.t.audiences.map((a) => ({ ...a, link: pageUrl(this.#locale.lang, a.page) }));
}
