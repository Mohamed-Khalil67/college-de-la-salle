import { Component, ElementRef, effect, input, model, output, viewChild } from '@angular/core';
import { Icon } from './icon';

let nextId = 0;

/**
 * A modal dialog on the native <dialog>: showModal() traps focus, Escape closes it and the page behind
 * becomes inert. Focus returns to the element that opened it.
 */
@Component({
  selector: 'cdls-modal',
  imports: [Icon],
  template: `
    <dialog #dialog class="modal" [attr.aria-labelledby]="titleId" (close)="onClose()">
      <div class="modal__header">
        <h2 class="t-h2" [id]="titleId">{{ title() }}</h2>
        <button class="modal__close" type="button" (click)="open.set(false)">
          <cdls-icon name="close" /><span class="visually-hidden">Fermer</span>
        </button>
      </div>
      <ng-content />
    </dialog>
  `,
})
export class Modal {
  readonly title = input.required<string>();
  readonly open = model(false);
  readonly closed = output<void>();

  protected readonly titleId = `cdls-modal-${++nextId}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  #opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.open) {
        this.#opener = dialog.ownerDocument.activeElement as HTMLElement | null;
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  protected onClose(): void {
    this.open.set(false);
    this.closed.emit();
    this.#opener?.focus();
    this.#opener = null;
  }
}
