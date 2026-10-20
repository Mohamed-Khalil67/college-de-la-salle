import { Component, input, model, output } from '@angular/core';
import { Alert, Button, Modal } from '../../ui';

/**
 * A confirmation dialog for actions with consequences (deactivate, delete, close a term, publish).
 * The message is projected; the parent runs the action on `confirmed` and closes it when done.
 */
@Component({
  selector: 'app-confirm-modal',
  imports: [Modal, Button, Alert],
  template: `
    <cdls-modal [title]="title()" [(open)]="open">
      <div class="stack">
        <ng-content />
        @if (error()) {
          <cdls-alert tone="danger">{{ error() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton [variant]="danger() ? 'danger' : 'primary'" type="button" [disabled]="busy()" (click)="confirmed.emit()">
            {{ busy() ? 'Un instant…' : confirmLabel() }}
          </button>
        </div>
      </div>
    </cdls-modal>
  `,
})
export class ConfirmModal {
  readonly title = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly danger = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly open = model(false);
  readonly confirmed = output<void>();
}
