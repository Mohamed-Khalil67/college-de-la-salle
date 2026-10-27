import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import type { HttpErrorResponse } from '@angular/common/http';
import { apiMessage } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';
import { Alert, Button, Field, FieldControl } from '../../shared/ui';
import { AuthShell } from './auth-shell';
import { shownError } from '../../shared/utils/forms';

/** First error message of a field once the user has left it (or tried to submit). */

/** « Mot de passe oublié » step 1: the login e-mail; the answer is the same whether or not an account matches. */
@Component({
  selector: 'app-forgot-password-page',
  imports: [FormField, RouterLink, Alert, Button, Field, FieldControl, AuthShell],
  template: `
    <app-auth-shell>
      @if (sent()) {
        <div class="stack stack--sm">
          <h1 class="t-h1" #heading tabindex="-1">Vérifiez votre messagerie</h1>
          <p role="status">
            Si un compte actif correspond à <strong>{{ model().identifier }}</strong
            >, un e-mail avec un lien de réinitialisation vient de lui être envoyé.
          </p>
          <p class="t-muted">Le lien reste valable un temps limité et ne sert qu’une fois. Pensez à regarder dans vos courriers indésirables.</p>
        </div>
        <p class="t-body-s">Pas de message ? Le secrétariat de votre cycle peut aussi réinitialiser votre mot de passe.</p>
      } @else {
        <div class="stack stack--sm">
          <h1 class="t-h1" #heading tabindex="-1">Mot de passe oublié</h1>
          <p class="t-muted">Saisissez votre identifiant : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
        </div>

        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }

        <form class="stack" novalidate (submit)="onSubmit($event)">
          <cdls-field label="Identifiant" helper="L’adresse e-mail fournie par le collège." [error]="identifierError()">
            <input cdlsControl type="email" autocomplete="username" [formField]="requestForm.identifier" />
          </cdls-field>
          <button cdlsButton [block]="true" type="submit" [disabled]="busy()">
            {{ busy() ? 'Envoi…' : 'Envoyer le lien' }}
          </button>
        </form>
      }
      <p class="t-body-s"><a routerLink="/connexion">Retour à la connexion</a></p>
    </app-auth-shell>
  `,
  styles: `
    [tabindex='-1']:focus {
      outline: none;
    }
  `,
})
export class ForgotPasswordPage {
  readonly #auth = inject(AuthStore);
  readonly #injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly model = signal({ identifier: '' });
  protected readonly requestForm = form(this.model, (path) => {
    required(path.identifier, { message: 'Saisissez votre adresse e-mail.' });
    email(path.identifier, { message: 'Saisissez une adresse e-mail complète, par exemple prenom.nom@lasalle-daher.eg.' });
  });
  protected readonly identifierError = computed(() => shownError(this.requestForm.identifier()));

  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.requestForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        await this.#auth.forgotPassword({ identifier: this.model().identifier.trim() });
        this.sent.set(true);
        afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.#injector });
      } catch (error) {
        const status = (error as HttpErrorResponse).status;
        this.failure.set(
          status === 429 ? 'Trop de demandes. Patientez une minute avant de réessayer.' : apiMessage(error),
        );
      } finally {
        this.busy.set(false);
      }
    });
  }
}
