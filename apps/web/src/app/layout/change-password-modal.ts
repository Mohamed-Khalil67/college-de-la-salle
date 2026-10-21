import { Component, effect, model, signal, untracked } from '@angular/core';
import { PasswordForm } from '../auth/password-form';
import { Alert, Button, Modal } from '../ui';

/** « Changer mon mot de passe », from the account menu of every space. */
@Component({
  selector: 'app-change-password-modal',
  imports: [Modal, Alert, Button, PasswordForm],
  template: `
    <cdls-modal title="Changer mon mot de passe" [(open)]="open">
      @if (done()) {
        <div class="stack">
          <cdls-alert tone="success">
            Votre mot de passe est modifié. Vos autres appareils ont été déconnectés : ils demanderont le nouveau mot de passe.
          </cdls-alert>
          <div class="modal__footer">
            <button cdlsButton type="button" (click)="open.set(false)">Terminé</button>
          </div>
        </div>
      } @else {
        <app-password-form (changed)="done.set(true)">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
        </app-password-form>
      }
    </cdls-modal>
  `,
})
export class ChangePasswordModal {
  readonly open = model(false);
  protected readonly done = signal(false);

  constructor() {
    // A fresh form each time the dialog opens.
    effect(() => {
      if (this.open()) untracked(() => this.done.set(false));
    });
  }
}
