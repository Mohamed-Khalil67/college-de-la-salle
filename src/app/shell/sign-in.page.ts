import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { email, form, FormField, FormRoot, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AuthStore } from '@exam/data-access-exams';
import { arabicErrorMessage } from '@exam/ui-arabic';

const RETURN_URL_KEY = 'exam-platform:return-url';

@Component({
  selector: 'app-sign-in-page',
  imports: [FormField, FormRoot],
  template: `
    <section class="panel narrow">
      <p class="eyebrow">المُمتحِنون</p>
      <h1>سجِّل الدخول لإنشاء الاختبارات وتصحيحها</h1>
      <p class="muted">
        لا يحتاج المُختبَرون إلى حساب؛ إذ ينضمّون برمز الاختبار، ويُمنَح كلٌّ منهم هويةً مجهولةً مقصورةً على الاختبار.
      </p>
      @if (auth.user()?.isAnonymous) {
        <p class="hint" role="note">
          أنت مسجَّل حاليًّا بوصفك مُختبَرًا مجهول الهوية، وسيحلّ حساب المُمتحِن محلَّه عند تسجيل الدخول.
        </p>
      }
      @if (error() ?? auth.redirectError(); as message) {
        <p class="form-error" role="alert">{{ message }}</p>
      }
      <button type="button" class="primary" [disabled]="busy()" (click)="signIn()">
        {{ busy() ? 'جارٍ تسجيل الدخول…' : 'المتابعة بحساب Google' }}
      </button>

      @if (auth.emulatorSignInAvailable) {
        <form [formRoot]="devForm" (submit)="devSignIn($event)" class="dev">
          <h2>الدخول عبر المحاكي المحلي</h2>
          <p class="hint">
            لبيئة التطوير فقط: يستعمل اعتمادًا تجريبيًّا غير موقَّع يقبله محاكي المصادقة. استعمل بريدًا مختلفًا
            لتمثيل مُمتحِنين مختلفين.
          </p>
          <label for="dev-email">بريد المُمتحِن</label>
          <div class="row">
            <input id="dev-email" type="email" class="ltr" [formField]="devForm.email" />
            <button type="submit" [disabled]="busy()">دخول</button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .narrow { max-inline-size: 34rem; margin-block: 2rem; margin-inline: auto; }
    .dev { display: grid; gap: 0.4rem; margin-block-start: 2rem; padding-block-start: 1.25rem; border-block-start: 1px dashed var(--border); }
    .dev h2 { margin: 0; font-size: 1.2rem; }
    .row { display: flex; gap: 0.5rem; }
    .row input { flex: 1; }
  `,
})export class SignInPage {
  readonly returnUrl = input<string | undefined>();

  protected readonly auth = inject(AuthStore);
  readonly #router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly devModel = signal({ email: 'examiner@example.test' });
  protected readonly devForm = form(this.devModel, (p) => {
    required(p.email, { message: 'أدخِل البريد الإلكتروني.' });
    email(p.email, { message: 'صيغة البريد الإلكتروني غير صحيحة.' });
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
      this.error.set(arabicErrorMessage(error));
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
