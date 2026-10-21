import { Component, ElementRef, Injector, afterNextRender, effect, inject, model, signal, untracked, viewChild } from '@angular/core';
import { PasswordForm } from '../auth/password-form';
import { Alert, Button, Modal } from '../ui';

/** « Changer mon mot de passe », from the account menu of every space. */
@Component({
  selector: 'app-change-password-modal',
  imports: [Modal, Alert, Button, PasswordForm],
  template: `
    <cdls-modal title="Changer mon mot de passe" [(open)]="open">
      @if (done()) {
        <div class="stack" #doneBlock tabindex="-1">
          <cdls-alert tone="success">
            Votre mot de passe est modifié. Vos autres appareils ont été déconnectés : ils demanderont le nouveau mot de passe.
          </cdls-alert>
          <div class="modal__footer">
            <button cdlsButton type="button" (click)="open.set(false)">Terminé</button>
          </div>
        </div>
      } @else if (open()) {
        <app-password-form (changed)="onChanged()">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
        </app-password-form>
      }
    </cdls-modal>
  `,
})
export class ChangePasswordModal {
  readonly open = model(false);
  protected readonly done = signal(false);
  readonly #injector = inject(Injector);
  private readonly doneBlock = viewChild<ElementRef<HTMLElement>>('doneBlock');

  protected onChanged(): void {
    this.done.set(true);
    // The form is replaced by the confirmation: move the focus onto it instead of losing it.
    afterNextRender(() => this.doneBlock()?.nativeElement.focus(), { injector: this.#injector });
  }

  constructor() {
    // A fresh form each time the dialog opens.
    effect(() => {
      if (this.open()) untracked(() => this.done.set(false));
    });
  }
}
