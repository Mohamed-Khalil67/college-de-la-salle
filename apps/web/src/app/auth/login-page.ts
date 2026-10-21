import { Component, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import type { HttpErrorResponse } from '@angular/common/http';
import { AuthStore, HOME_BY_ROLE, landingFor } from '../core/auth/auth-store';
import { apiMessage } from '../core/api/api-client';
import { Alert, Button, Field, FieldControl, Wordmark } from '../ui';

/** First error message of a field once the user has left it (or tried to submit). */
function shownError(state: { touched(): boolean; errors(): readonly { message?: string }[] }): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}

/** Sign-in for students, teachers and staff. Accounts are created by the college: there is no sign-up. */
@Component({
  selector: 'app-login-page',
  imports: [FormField, RouterLink, NgOptimizedImage, Alert, Button, Field, FieldControl, Wordmark],
  template: `
    <a class="skip-link" href="#contenu">Aller au formulaire de connexion</a>
    <div class="auth">
      <aside class="auth__visual on-inverse" aria-label="Le collège">
        <img ngSrc="/images/school/batiment-brique.jpg" width="625" height="425" alt="" priority />
        <cdls-wordmark tone="dark" />
        <blockquote class="stack stack--sm">
          <p class="t-quote">« Signum Fidei »</p>
          <p class="t-body-s">Signe de la foi : la devise des Frères des Écoles chrétiennes, fondateurs du collège.</p>
        </blockquote>
      </aside>

      <main id="contenu" class="auth__form" tabindex="-1">
        <div class="auth__panel">
          <div class="stack stack--sm">
            <h1 class="t-h1">Connexion à votre espace</h1>
            <p class="t-muted">Élèves, enseignants et administration du collège.</p>
          </div>

          @if (failure()) {
            <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
          }

          <form class="stack" novalidate (submit)="onSubmit($event)">
            <cdls-field label="Identifiant" helper="L’adresse e-mail fournie par le collège." [error]="emailError()">
              <input cdlsControl type="email" autocomplete="username" [formField]="loginForm.email" />
            </cdls-field>
            <cdls-field label="Mot de passe" [error]="passwordError()">
              <div class="field__row">
                <input cdlsControl [type]="showPassword() ? 'text' : 'password'" autocomplete="current-password" [formField]="loginForm.password" />
                <button cdlsButton variant="tertiary" type="button" [attr.aria-pressed]="showPassword()" (click)="showPassword.set(!showPassword())">
                  {{ showPassword() ? 'Masquer' : 'Afficher' }}<span class="visually-hidden"> le mot de passe</span>
                </button>
              </div>
            </cdls-field>
            <button cdlsButton [block]="true" type="submit" [disabled]="busy()">
              {{ busy() ? 'Connexion…' : 'Se connecter' }}
            </button>
          </form>

          <div class="stack stack--sm t-body-s">
            <p>Mot de passe oublié ? Contactez le secrétariat de votre cycle, qui le réinitialisera.</p>
            <p class="t-muted">Les comptes sont créés par le collège : il n’y a pas d’inscription en ligne.</p>
            <p><a routerLink="/">Retour au site du collège</a></p>
          </div>
        </div>
      </main>
    </div>
  `,
})
export class LoginPage {
  /** Where to go after signing in (?suite=/eleve/notes), when it belongs to the user's area. */
  readonly suite = input<string>();

  readonly #auth = inject(AuthStore);
  readonly #router = inject(Router);

  protected readonly model = signal({ email: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.email, { message: 'Saisissez votre adresse e-mail.' });
    email(path.email, { message: 'Saisissez une adresse e-mail complète, par exemple prenom.nom@lasalle-daher.eg.' });
    required(path.password, { message: 'Saisissez votre mot de passe.' });
  });
  protected readonly emailError = computed(() => shownError(this.loginForm.email()));
  protected readonly passwordError = computed(() => shownError(this.loginForm.password()));

  protected readonly showPassword = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.loginForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const user = await this.#auth.login(this.model());
        const home = HOME_BY_ROLE[user.role];
        const suite = this.suite();
        if (user.mustChangePassword) await this.#router.navigateByUrl(landingFor(user));
        else await this.#router.navigateByUrl(suite?.startsWith(home) ? suite : home);
      } catch (error) {
        const status = (error as HttpErrorResponse).status;
        this.failure.set(
          status === 401
            ? 'Identifiant ou mot de passe incorrect. Vérifiez la saisie ou contactez le secrétariat de votre cycle.'
            : status === 429
              ? 'Trop de tentatives. Patientez une minute avant de réessayer.'
              : apiMessage(error),
        );
      } finally {
        this.busy.set(false);
      }
    });
  }
}
