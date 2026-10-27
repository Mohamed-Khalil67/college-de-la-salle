import { Component, computed, input, model } from '@angular/core';
import { Icon } from './icon';
import { pageWindow } from './page-window';

/** Page buttons for a paginated list ("1 à 20 sur 312 élèves"). */
@Component({
  selector: 'cdls-pagination',
  imports: [Icon],
  template: `
    @if (total() > 0) {
      <nav class="pagination" [attr.aria-label]="label()">
        <p>{{ first() }} à {{ last() }} sur {{ total() }} {{ noun() }}</p>
        @if (pageCount() > 1) {
          <ul role="list">
            @if (page() > 1) {
              <li>
                <button type="button" (click)="page.set(page() - 1)">
                  <cdls-icon name="chevron-left" /><span class="visually-hidden">Page précédente</span>
                </button>
              </li>
            }
            @for (p of pages(); track $index) {
              <li>
                @if (p === null) {
                  <span class="t-muted" aria-hidden="true">…</span>
                } @else {
                  <button type="button" [attr.aria-current]="p === page() ? 'page' : null" (click)="page.set(p)">
                    <span class="visually-hidden">Page </span>{{ p }}
                  </button>
                }
              </li>
            }
            @if (page() < pageCount()) {
              <li>
                <button type="button" (click)="page.set(page() + 1)">
                  <cdls-icon name="chevron-right" /><span class="visually-hidden">Page suivante</span>
                </button>
              </li>
            }
          </ul>
        }
      </nav>
    }
  `,
})
export class Pagination {
  readonly total = input.required<number>();
  readonly pageSize = input(20);
  readonly label = input('Pagination');
  readonly noun = input('résultats');
  readonly page = model(1);

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly first = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly last = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  protected readonly pages = computed(() => pageWindow(this.page(), this.pageCount()));
}
