import { Component, ElementRef, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavMenuItem {
  readonly label: string;
  readonly link: string;
}

let nextId = 0;

/**
 * Dropdown in the WAI-ARIA disclosure pattern (button + list of links), not an ARIA `menu`: site
 * navigation is links, and screen-reader users keep their normal link navigation. Closes on
 * Escape (returning focus to the trigger), on an outside click, when focus leaves, and on
 * selection. The links are in the prerendered HTML, so crawlers follow them even while closed.
 */
@Component({
  selector: 'app-nav-menu',
  imports: [RouterLink, RouterLinkActive],
  host: {
    '(keydown.escape)': 'closeAndFocus()',
    '(focusout)': 'onFocusOut($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="trigger"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      (click)="open.set(!open())"
    >
      {{ label() }}
      <span class="caret" aria-hidden="true">▾</span>
    </button>
    <ul class="panel-list" [id]="panelId" [hidden]="!open()">
      @for (item of items(); track item.link) {
        <li>
          <a [routerLink]="item.link" routerLinkActive="active" (click)="open.set(false)">{{ item.label }}</a>
        </li>
      }
    </ul>
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .trigger {
      display: inline-flex; align-items: center; gap: 0.3rem;
      padding-block: 0.3rem; padding-inline: 0.6rem; border: 0; background: none;
      color: var(--accent); font: inherit; font-weight: 600;
    }
    .trigger:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent-strong); }
    .trigger[aria-expanded='true'] .caret { transform: rotate(180deg); }
    .caret { transition: transform 0.15s; font-size: 0.8em; }
    .panel-list {
      position: absolute; inset-block-start: calc(100% + 0.25rem); inset-inline-start: 0; z-index: 20;
      min-inline-size: 13rem; margin: 0; padding-block: 0.4rem; padding-inline: 0; list-style: none;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      box-shadow: 0 10px 30px rgb(0 0 0 / 0.12);
    }
    .panel-list a { display: block; padding-block: 0.45rem; padding-inline: 1rem; text-decoration: none; white-space: nowrap; }
    .panel-list a:hover, .panel-list a:focus-visible, .panel-list a.active { background: var(--accent-soft); }
    /* Small screens: expand in the flow instead of floating, so nothing can overflow the viewport. */
    @media (max-width: 640px) {
      :host { display: block; }
      .panel-list { position: static; box-shadow: none; margin-block-start: 0.25rem; }
    }
  `,
})
export class NavMenu {
  readonly label = input.required<string>();
  readonly items = input.required<readonly NavMenuItem[]>();

  protected readonly open = signal(false);
  protected readonly panelId = `nav-menu-${nextId++}`;
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected closeAndFocus(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.#host.nativeElement.querySelector<HTMLButtonElement>('.trigger')?.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.#host.nativeElement.contains(next)) return;
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && event.target instanceof Node && !this.#host.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
