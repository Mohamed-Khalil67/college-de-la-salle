import { Component, computed, inject, input, output, signal } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import type { HttpErrorResponse } from '@angular/common/http';
import { passwordProblems } from '@cdls/shared';
import { apiMessage } from '../core/api/api-client';
import { AuthStore } from '../core/auth/auth-store';
import { Alert, Button, Field, FieldControl } from '../ui';

interface PasswordModel {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}

/** First error message of a field once the user has left it (or tried to submit). */
function shownError(state: { touched(): boolean; errors(): readonly { message?: string }[] }): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}

/**
 * Chooses a new password: the current (or temporary) one, the new one twice. The rules are the API's
 * (`passwordProblems`: 10 characters at least, not the e-mail), checked here first so the message
 * appears next to the field. Used by the first-access page and the account menu.
 */
@Component({
  selector: 'app-password-form',
  imports: [FormField, Alert, Button, Field, FieldControl],
  template: `
    <form class="stack" novalidate (submit)="onSubmit($event)">
      <cdls-field [label]="currentLabel()" [helper]="currentHelper()" [error]="currentError()">
        <input cdlsControl [type]="inputType()" autocomplete="current-password" [formField]="passwordForm.currentPassword" />
      </cdls-field>
      <cdls-field
        label="Nouveau mot de passe"
        helper="Au moins 10 caractères, et pas votre adresse e-mail. Une phrase facile à retenir convient très bien."
        [error]="newError()"
      >
        <input cdlsControl [type]="inputType()" autocomplete="new-password" [formField]="passwordForm.newPassword" />
      </cdls-field>
      <cdls-field label="Confirmer le nouveau mot de passe" [error]="confirmError()">
        <input cdlsControl [type]="inputType()" autocomplete="new-password" [formField]="passwordForm.confirmation" />
      </cdls-field>
      <label class="check">
        <input type="checkbox" [checked]="visible()" (change)="visible.set(!visible())" />
        <span>Afficher les mots de passe</span>
      </label>
      @if (failure()) {
        <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
      }
      <div class="actions">
        <ng-content />
        <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : submitLabel() }}</button>
      </div>
    </form>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      justify-content: flex-end;
    }
  `,
})
export class PasswordForm {
  readonly currentLabel = input('Mot de passe actuel');
  readonly currentHelper = input('');
  readonly submitLabel = input('Enregistrer le mot de passe');
  /** Emitted once the new password is saved (the other sessions are signed out by the API). */
  readonly changed = output<void>();

  readonly #auth = inject(AuthStore);

  protected readonly model = signal<PasswordModel>({ currentPassword: '', newPassword: '', confirmation: '' });
  protected readonly passwordForm = form(this.model, (p) => {
    required(p.currentPassword, { message: 'Saisissez votre mot de passe actuel.' });
    required(p.newPassword, { message: 'Choisissez un nouveau mot de passe.' });
    validate(p.newPassword, ({ value }) => {
      const problems = passwordProblems(value(), this.#auth.user()?.email ?? '');
      return problems.length ? { kind: 'weak', message: problems[0] } : undefined;
    });
    validate(p.newPassword, ({ value, valueOf }) =>
      value() && value() === valueOf(p.currentPassword)
        ? { kind: 'same', message: 'Choisissez un mot de passe différent de l’actuel.' }
        : undefined,
    );
    required(p.confirmation, { message: 'Saisissez une seconde fois le nouveau mot de passe.' });
    validate(p.confirmation, ({ value, valueOf }) =>
      value() && value() !== valueOf(p.newPassword)
        ? { kind: 'mismatch', message: 'Les deux mots de passe ne sont pas identiques.' }
        : undefined,
    );
  });

  protected readonly currentError = computed(() => shownError(this.passwordForm.currentPassword()));
  protected readonly newError = computed(() => shownError(this.passwordForm.newPassword()));
  protected readonly confirmError = computed(() => shownError(this.passwordForm.confirmation()));

  protected readonly visible = signal(false);
  protected readonly inputType = computed(() => (this.visible() ? 'text' : 'password'));
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.passwordForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const { currentPassword, newPassword } = this.model();
        await this.#auth.changePassword({ currentPassword, newPassword });
        this.passwordForm().reset({ currentPassword: '', newPassword: '', confirmation: '' });
        this.changed.emit();
      } catch (error) {
        const status = (error as HttpErrorResponse).status;
        this.failure.set(
          status === 429 ? 'Trop de tentatives. Patientez une minute avant de réessayer.' : apiMessage(error),
        );
      } finally {
        this.busy.set(false);
      }
    });
  }
}
