import { Component, input, model } from '@angular/core';
import { tabTarget } from './tab-keys';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  /** Optional count shown after the label. */
  readonly count?: number | null;
}

let nextId = 0;

/**
 * ARIA tabs with automatic activation: arrow keys, Home and End move between tabs. The content of the
 * selected tab is projected into the single tab panel.
 */
@Component({
  selector: 'cdls-tabs',
  template: `
    <div class="tabs">
      <div class="tabs__list" role="tablist" [attr.aria-label]="label()">
        @for (tab of tabs(); track tab.id; let i = $index) {
          <button
            class="tabs__tab"
            type="button"
            role="tab"
            [id]="tabId(tab.id)"
            [attr.aria-selected]="tab.id === value()"
            [attr.aria-controls]="panelId"
            [tabIndex]="tab.id === value() ? 0 : -1"
            (click)="value.set(tab.id)"
            (keydown)="onKeydown($event, i)"
          >
            {{ tab.label }}
            @if (tab.count !== undefined && tab.count !== null) {
              <span class="t-muted">{{ tab.count }}</span>
            }
          </button>
        }
      </div>
      <section class="tabs__panel" role="tabpanel" [id]="panelId" [attr.aria-labelledby]="tabId(value())">
        <ng-content />
      </section>
    </div>
  `,
})
export class Tabs {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly label = input.required<string>();
  readonly value = model.required<string>();

  readonly #base = `cdls-tabs-${++nextId}`;
  protected readonly panelId = `${this.#base}-panel`;

  tabId(id: string): string {
    return `${this.#base}-tab-${id}`;
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const target = tabTarget(event.key, index, this.tabs().length);
    if (target === null) return;
    event.preventDefault();
    const next = this.tabs()[target];
    if (!next) return;
    this.value.set(next.id);
    const list = (event.currentTarget as HTMLElement).parentElement;
    list?.querySelector<HTMLElement>(`[id="${this.tabId(next.id)}"]`)?.focus();
  }
}
