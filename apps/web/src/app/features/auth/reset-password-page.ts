import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import type { HttpErrorResponse } from '@angular/common/http';
import { passwordProblems } from '@cdls/shared';
import { apiMessage } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';
import { Alert, Button, Field, FieldControl } from '../../shared/ui';
import { AuthShell } from './auth-shell';
import { shownError } from '../../shared/utils/forms';

/** First error message of a field once the user has left it (or tried to submit). */

/**
 * « Mot de passe oublié » step 2, opened from the e-mailed link (`?token=…`): chooses the new password.
 * The e-mail is not known here, so the « not your e-mail » rule is the API's to check.
 */
@Component({
  selector: 'app-reset-password-page',
  imports: [FormField, RouterLink, Alert, Button, Field, FieldControl, AuthShell],
  template: `
    <app-auth-shell>
      @if (done()) {
        <div class="stack stack--sm">
          <h1 class="t-h1" #heading tabindex="-1">Mot de passe modifié</h1>
          <p role="status">Votre nouveau mot de passe est enregistré. Vos autres appareils ont été déconnectés.</p>
        </div>
        <div><a cdlsButton routerLink="/connexion">Se connecter</a></div>
      } @else if (!token()) {
        <div class="stack stack--sm">
          <h1 class="t-h1" #heading tabindex="-1">Lien incomplet</h1>
          <p>Ce lien ne contient pas son code. Ouvrez-le depuis l’e-mail reçu, ou demandez-en un nouveau.</p>
        </div>
        <div><a cdlsButton routerLink="/connexion/oubli">Demander un nouveau lien</a></div>
      } @else {
        <div class="stack stack--sm">
          <h1 class="t-h1" #heading tabindex="-1">Choisir un nouveau mot de passe</h1>
          <p class="t-muted">Vous avez ouvert le lien reçu par e-mail. Il ne sert qu’une fois.</p>
        </div>

        @if (failure()) {
          <cdls-alert tone="danger">
            {{ failure() }}
            @if (linkProblem()) {
              <a routerLink="/connexion/oubli">Demander un nouveau lien</a>
            }
          </cdls-alert>
        }

        <form class="stack" novalidate (submit)="onSubmit($event)">
          <cdls-field
            label="Nouveau mot de passe"
            helper="Au moins 10 caractères, et pas votre adresse e-mail. Une phrase facile à retenir convient très bien."
            [error]="newError()"
          >
            <input cdlsControl [type]="inputType()" autocomplete="new-password" [formField]="resetForm.newPassword" />
          </cdls-field>
          <cdls-field label="Confirmer le nouveau mot de passe" [error]="confirmError()">
            <input cdlsControl [type]="inputType()" autocomplete="new-password" [formField]="resetForm.confirmation" />
          </cdls-field>
          <label class="check">
            <input type="checkbox" [checked]="visible()" (change)="visible.set(!visible())" />
            <span>Afficher les mots de passe</span>
          </label>
          <button cdlsButton [block]="true" type="submit" [disabled]="busy()">
            {{ busy() ? 'Enregistrement…' : 'Enregistrer le mot de passe' }}
          </button>
        </form>
        <p class="t-body-s"><a routerLink="/connexion">Retour à la connexion</a></p>
      }
    </app-auth-shell>
  `,
  styles: `
    [tabindex='-1']:focus {
      outline: none;
    }
  `,
})
export class ResetPasswordPage {
  /** The token of the link (`?token=`). */
  readonly token = input<string>();

  readonly #auth = inject(AuthStore);
  readonly #injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly model = signal({ newPassword: '', confirmation: '' });
  protected readonly resetForm = form(this.model, (p) => {
    required(p.newPassword, { message: 'Choisissez un nouveau mot de passe.' });
    validate(p.newPassword, ({ value }) => {
      const problems = passwordProblems(value(), '');
      return problems.length ? { kind: 'weak', message: problems[0] } : undefined;
    });
    required(p.confirmation, { message: 'Saisissez une seconde fois le nouveau mot de passe.' });
    validate(p.confirmation, ({ value, valueOf }) =>
      value() && value() !== valueOf(p.newPassword)
        ? { kind: 'mismatch', message: 'Les deux mots de passe ne sont pas identiques.' }
        : undefined,
    );
  });
  protected readonly newError = computed(() => shownError(this.resetForm.newPassword()));
  protected readonly confirmError = computed(() => shownError(this.resetForm.confirmation()));

  protected readonly visible = signal(false);
  protected readonly inputType = computed(() => (this.visible() ? 'text' : 'password'));
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** The link itself is refused (expired, used, unknown): a new one is the way out. */
  protected readonly linkProblem = signal(false);

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.resetForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      this.linkProblem.set(false);
      try {
        await this.#auth.resetPassword({ token: this.token() ?? '', newPassword: this.model().newPassword });
        this.done.set(true);
        afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.#injector });
      } catch (error) {
        const status = (error as HttpErrorResponse).status;
        const message = apiMessage(error);
        this.linkProblem.set(status === 400 && message.startsWith('Ce lien'));
        this.failure.set(
          status === 429 ? 'Trop de tentatives. Patientez une minute avant de réessayer.' : message,
        );
      } finally {
        this.busy.set(false);
      }
    });
  }
}
