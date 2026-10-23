import { Component, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import type { HttpErrorResponse } from '@angular/common/http';
import { AuthStore, HOME_BY_ROLE, landingFor } from '../core/auth/auth-store';
import { LanguageSwitcher } from '../layout/language-switcher';
import { LOCALE } from '../i18n/locale';
import { pageUrl } from '../i18n/pages';
import { apiMessage } from '../core/api/api-client';
import { Alert, Button, Field, FieldControl, SkipLink, Wordmark } from '../ui';

/** First error message of a field once the user has left it (or tried to submit). */
function shownError(state: { touched(): boolean; errors(): readonly { message?: string }[] }): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}

/**
 * Sign-in for students, teachers and staff, in the route's language (/connexion, /en/login, /ar/login; the
 * spaces behind it are in French). Accounts are created by the college: there is no sign-up.
 */
@Component({
  selector: 'app-login-page',
  imports: [FormField, RouterLink, NgOptimizedImage, Alert, Button, Field, FieldControl, LanguageSwitcher, SkipLink, Wordmark],
  template: `
    <a cdlsSkipLink>{{ t.skip }}</a>
    <div class="auth">
      <aside class="auth__visual on-inverse" [attr.aria-label]="t.college">
        <img ngSrc="/images/school/batiment-brique.jpg" width="625" height="425" alt="" priority />
        <cdls-wordmark tone="dark" [link]="home" [subtitle]="place" />
        <blockquote class="stack stack--sm">
          <p class="t-quote" lang="la">« Signum Fidei »</p>
          <p class="t-body-s">{{ t.mottoMeaning }}</p>
        </blockquote>
      </aside>

      <main id="contenu" class="auth__form" tabindex="-1">
        <div class="auth__panel">
          <nav siteLanguages tone="light" [current]="lang" page="login" [label]="languagesLabel"></nav>
          <div class="stack stack--sm">
            <h1 class="t-h1">{{ t.title }}</h1>
            <p class="t-muted">{{ t.lead }}</p>
            @if (t.spacesLanguage) {
              <p class="t-body-s">{{ t.spacesLanguage }}</p>
            }
          </div>

          @if (failure()) {
            <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
          }

          <form class="stack" novalidate (submit)="onSubmit($event)">
            <cdls-field [label]="t.identifier" [helper]="t.identifierHelp" [error]="emailError()">
              <input cdlsControl type="email" autocomplete="username" [formField]="loginForm.email" />
            </cdls-field>
            <cdls-field [label]="t.password" [error]="passwordError()">
              <div class="field__row">
                <input cdlsControl [type]="showPassword() ? 'text' : 'password'" autocomplete="current-password" [formField]="loginForm.password" />
                <button cdlsButton variant="tertiary" type="button" [attr.aria-pressed]="showPassword()" (click)="showPassword.set(!showPassword())">
                  {{ showPassword() ? t.hide : t.show }}<span class="visually-hidden">{{ t.thePassword }}</span>
                </button>
              </div>
            </cdls-field>
            <p class="t-body-s"><a routerLink="/connexion/oubli" hreflang="fr">{{ t.forgot }}</a></p>
            <button cdlsButton [block]="true" type="submit" [disabled]="busy()">
              {{ busy() ? t.submitting : t.submit }}
            </button>
          </form>

          <div class="stack stack--sm t-body-s">
            <p>{{ t.noEmail }}</p>
            <p class="t-muted">{{ t.noSignUp }}</p>
            <p><a [routerLink]="home">{{ t.backToSite }}</a></p>
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
  readonly #locale = inject(LOCALE);

  protected readonly lang = this.#locale.lang;
  protected readonly languagesLabel = this.#locale.messages.layout.languages;
  protected readonly t = this.#locale.messages.login;
  protected readonly home = pageUrl(this.#locale.lang, 'home');
  protected readonly place = this.#locale.content.school.place;
  protected readonly model = signal({ email: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    const errors = this.t.errors;
    required(path.email, { message: errors.emailRequired });
    email(path.email, { message: errors.emailInvalid });
    required(path.password, { message: errors.passwordRequired });
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
        const errors = this.t.errors;
        this.failure.set(
          status === 401
            ? errors.wrongCredentials
            : status === 429
              ? errors.tooManyAttempts
              : this.#locale.messages.common.showServerMessages
                ? apiMessage(error)
                : errors.other,
        );
      } finally {
        this.busy.set(false);
      }
    });
  }
}
