import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOCALE } from '../../../i18n/locale';
import { pageUrl } from '../../../i18n/pages';
import { Breadcrumb } from '../shared/breadcrumb';

/**
 * `/accessibilite`: the accessibility statement, in the shape of an RGAA statement (status, what is tested,
 * known limitations, test environment, contact, remedies). The words are the language's `accessibility`
 * messages; update the date there whenever the facts change (docs/accessibility.md).
 */
@Component({
  selector: 'site-accessibility-page',
  imports: [RouterLink, Breadcrumb],
  template: `
    <section class="section section--subtle page-intro page-intro--compact" aria-labelledby="page-title">
      <div class="container stack">
        <nav siteBreadcrumb [current]="a.title"></nav>
        <h1 id="page-title" class="t-display-l">{{ a.title }}</h1>
        <p class="t-body-l prose-width">{{ a.lead }}</p>
        <p class="t-body-s t-muted">{{ a.updated }}</p>
        <nav aria-labelledby="toc-title">
          <h2 id="toc-title" class="t-label t-muted">{{ a.onThisPage }}</h2>
          <ul class="toc" role="list">
            @for (s of a.sections; track s.id) {
              <li><a class="t-label" [routerLink]="[]" [fragment]="s.id">{{ s.title }}</a></li>
            }
          </ul>
        </nav>
      </div>
    </section>

    <div class="section">
      <div class="container content-grid">
        <article class="prose">
          @for (s of a.sections; track s.id) {
            <h2 [id]="s.id" class="t-h1">{{ s.title }}</h2>
            @for (p of s.paragraphs; track $index) {
              <p>
                {{ p.text }}
                @if (p.link; as link) {
                  @if (link.page) {
                    <a [routerLink]="pageLink(link.page)">{{ link.label }}</a>.
                  } @else {
                    <a [href]="link.href">{{ link.label }}</a>
                  }
                }
              </p>
            }
            @if (s.items) {
              <ul class="bullets" role="list">
                @for (item of s.items; track $index) {
                  <li>{{ item }}</li>
                }
              </ul>
            }
          }
        </article>

        <aside class="card card--panel summary" aria-labelledby="summary-title">
          <h2 id="summary-title" class="t-h3">{{ a.summaryTitle }}</h2>
          <dl>
            @for (item of a.summary; track item.label) {
              <div>
                <dt class="t-label">{{ item.label }}</dt>
                <dd class="t-body-s">{{ item.value }}</dd>
              </div>
            }
          </dl>
        </aside>
      </div>
    </div>
  `,
  styles: `
    .toc {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-6);
      margin-top: var(--space-2);
    }
    .toc a {
      display: inline-block;
      padding-block: var(--space-3);
    }
    .prose h2 {
      scroll-margin-top: var(--space-6);
    }
    .summary {
      align-self: start;
    }
    .summary dl {
      display: grid;
      gap: var(--space-4);
      margin: var(--space-4) 0 0;
    }
    .summary dt {
      color: var(--color-heading);
    }
    .summary dd {
      margin: var(--space-1) 0 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class AccessibilityPage {
  readonly #locale = inject(LOCALE);
  protected readonly a = this.#locale.messages.accessibility;
  protected readonly pageLink = (page: Parameters<typeof pageUrl>[1]) => pageUrl(this.#locale.lang, page);
}
