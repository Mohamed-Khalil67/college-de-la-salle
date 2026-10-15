import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { email, form, FormField, FormRoot, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AuthStore } from '@exam/data-access-exams';

const RETURN_URL_KEY = 'exam-platform:return-url';

@Component({
  selector: 'app-sign-in-page',
  imports: [FormField, FormRoot],
  template: `
    <section class="panel narrow">
      <p class="eyebrow">Examiners</p>
      <h1>Sign in to create and grade exams</h1>
      <p class="muted">
        Candidates don't need an account. They join with an access code and get an anonymous,
        exam-scoped identity.
      </p>
      @if (auth.user()?.isAnonymous) {
        <p class="hint" role="note">
          You're currently signed in as an anonymous candidate. Signing in as an examiner replaces it.
        </p>
      }
      @if (error() ?? auth.redirectError(); as message) {
        <p class="form-error" role="alert">{{ message }}</p>
      }
      <button type="button" class="primary" [disabled]="busy()" (click)="signIn()">
        {{ busy() ? 'Signing in…' : 'Continue with Google' }}
      </button>

      @if (auth.emulatorSignInAvailable) {
        <form [formRoot]="devForm" (submit)="devSignIn($event)" class="dev">
          <h2>Local emulator sign-in</h2>
          <p class="hint">
            Development only — uses an unsigned test credential accepted by the Auth emulator. Use
            different emails to act as different examiners.
          </p>
          <label for="dev-email">Examiner email</label>
          <div class="row">
            <input id="dev-email" type="email" [formField]="devForm.email" />
            <button type="submit" [disabled]="busy()">Sign in</button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .narrow { max-width: 30rem; margin: 3rem auto; }
    .dev { display: grid; gap: 0.4rem; margin-top: 2rem; padding-top: 1.25rem; border-top: 1px dashed var(--border); }
    .dev h2 { margin: 0; font-size: 1rem; }
    .hint { color: var(--muted); font-size: 0.85rem; margin: 0; }
    .row { display: flex; gap: 0.5rem; }
    .row input { flex: 1; }
  `,
})
export class SignInPage {
  readonly returnUrl = input<string | undefined>();

  protected readonly auth = inject(AuthStore);
  readonly #router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly devModel = signal({ email: 'examiner@example.test' });
  protected readonly devForm = form(this.devModel, (p) => {
    required(p.email);
    email(p.email);
  });

  constructor() {
    // Works for every flow: popup/credential resolve in place, redirect lands back here signed in.
    effect(() => {
      if (!this.auth.isExaminer()) return;
      untracked(() => void this.#router.navigateByUrl(this.#consumeReturnUrl()));
    });
  }

  protected signIn(): Promise<void> {
    return this.#run(() => this.auth.signInExaminer());
  }

  protected devSignIn(event: Event): void {
    event.preventDefault();
    void submit(this.devForm, async () => {
      await this.#run(() => this.auth.signInExaminerOnEmulator(this.devModel().email));
      return undefined;
    });
  }

  async #run(signIn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      sessionStorage.setItem(RETURN_URL_KEY, this.returnUrl() ?? '/examiner');
      if (this.auth.user()?.isAnonymous) await this.auth.signOut();
      await signIn();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      this.busy.set(false);
    }
  }

  #consumeReturnUrl(): string {
    const stored = sessionStorage.getItem(RETURN_URL_KEY);
    sessionStorage.removeItem(RETURN_URL_KEY);
    // Only allow in-app paths (no open redirects).
    const url = this.returnUrl() ?? stored ?? '/examiner';
    return url.startsWith('/') && !url.startsWith('//') ? url : '/examiner';
  }
}
