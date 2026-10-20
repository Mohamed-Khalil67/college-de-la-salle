import { Component, input, signal } from '@angular/core';
import { Button } from '../../ui';

/** Copies a value (a temporary password) to the clipboard and says so in a polite live region. */
@Component({
  selector: 'app-copy-button',
  imports: [Button],
  template: `
    <button cdlsButton variant="secondary" size="sm" type="button" (click)="copy()">
      Copier<span class="visually-hidden"> {{ what() }}</span>
    </button>
    <span class="t-body-s t-muted" role="status">{{ status() }}</span>
  `,
  host: { class: 'copy-button' },
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
  `,
})
export class CopyButton {
  readonly value = input.required<string>();
  /** Completes the hidden label: « Copier le mot de passe de … ». */
  readonly what = input('');
  protected readonly status = signal('');

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.value());
      this.status.set('Copié.');
    } catch {
      this.status.set('Copie impossible : sélectionnez le texte et copiez-le.');
    }
  }
}
