import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { email, form, FormField, FormRoot, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AuthStore } from '@exam/data-access-exams';
import { arabicErrorMessage } from '@exam/ui-arabic';

const RETURN_URL_KEY = 'exam-platform:return-url';

/**
 * One sign-in for everyone. Afterwards the server-checked role decides where you land:
 * allow-listed examiners → their dashboard; everyone else → the candidate page (or the exam they
 * were trying to open).
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [FormField, FormRoot],
  template: `
    <section class="panel narrow">
      <p class="eyebrow">تسجيل الدخول</p>
      <h1>ادخل إلى حسابك</h1>
      <p class="muted">
        يصل المُمتحِنون المعتمدون إلى لوحة إدارة اختباراتهم، ويرى غيرُهم الاختبارات المدعوّين إليها.
        لا يحتاج أداء الاختبارات المفتوحة إلى حساب؛ يكفي رمز الاختبار.
      </p>
      @if (auth.user()?.isAnonymous) {
        <p class="hint" role="note">
          أنت الآن مُختبَر مجهول الهوية، وسيحلّ حسابك محلَّ هذه الهوية عند تسجيل الدخول.
        </p>
      }
      @if (error() ?? auth.redirectError(); as message) {
        <p class="form-error" role="alert">{{ message }}</p>
      }
      @if (auth.hasAccount() && !auth.roleReady()) {
        <p class="muted" aria-busy="true">جارٍ التحقّق من صلاحيات حسابك…</p>
      }
      <button type="button" class="primary" [disabled]="busy()" (click)="signIn()">
        {{ busy() ? 'جارٍ تسجيل الدخول…' : 'المتابعة بحساب Google' }}
      </button>

      @if (auth.emulatorSignInAvailable) {
        <form [formRoot]="devForm" (submit)="devSignIn($event)" class="dev">
          <h2>الدخول عبر المحاكي المحلي</h2>
          <p class="hint">
            لبيئة التطوير فقط: يقبله محاكي المصادقة دون حساب حقيقي. الحسابات المُدرَجة في قائمة
            المُمتحِنين (<code class="ltr">config/examiners</code>) تدخل إلى اللوحة، وسواها يدخل بوصفه مُختبَرًا.
          </p>
          <label for="dev-email">البريد الإلكتروني</label>
          <input id="dev-email" type="email" class="ltr" [formField]="devForm.email" />
          <label for="dev-name">الاسم الظاهر <span class="muted">(اختياري)</span></label>
          <div class="row">
            <input id="dev-name" dir="auto" [formField]="devForm.name" />
            <button type="submit" [disabled]="busy()">دخول</button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .narrow { max-inline-size: 34rem; margin-block: 2rem; margin-inline: auto; }
    .dev { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.4rem; margin-block-start: 2rem; padding-block-start: 1.25rem; border-block-start: 1px dashed var(--border); }
    .dev h2 { margin: 0; font-size: 1.2rem; }
    .row { display: flex; gap: 0.5rem; }
    .row input { flex: 1; min-inline-size: 0; } /* inputs keep an intrinsic min width in flex rows */
  `,
})
export class SignInPage {
  readonly returnUrl = input<string | undefined>();

  protected readonly auth = inject(AuthStore);
  readonly #router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly devModel = signal({ email: 'examiner@example.test', name: '' });
  protected readonly devForm = form(this.devModel, (p) => {
    required(p.email, { message: 'أدخِل البريد الإلكتروني.' });
    email(p.email, { message: 'صيغة البريد الإلكتروني غير صحيحة.' });
  });

  constructor() {
    // Works for every flow: popup/credential resolve in place, redirect lands back here signed in.
    effect(() => {
      if (!this.auth.hasAccount() || !this.auth.roleReady()) return;
      const examiner = this.auth.isExaminer();
      untracked(() => void this.#router.navigateByUrl(this.#destination(examiner)));
    });
  }

  protected signIn(): Promise<void> {
    return this.#run(() => this.auth.signIn());
  }

  protected devSignIn(event: Event): void {
    event.preventDefault();
    void submit(this.devForm, async () => {
      const { email: address, name } = this.devModel();
      await this.#run(() => this.auth.signInOnEmulator(address, name.trim() || undefined));
      return undefined;
    });
  }

  async #run(signIn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.returnUrl()) sessionStorage.setItem(RETURN_URL_KEY, this.returnUrl()!);
      if (this.auth.user()?.isAnonymous) await this.auth.signOut();
      await signIn();
    } catch (error) {
      this.error.set(arabicErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Role-based landing. Only in-app paths are honoured (no open redirects). */
  #destination(examiner: boolean): string {
    const stored = sessionStorage.getItem(RETURN_URL_KEY);
    sessionStorage.removeItem(RETURN_URL_KEY);
    const requested = this.returnUrl() ?? stored;
    const safe = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : null;
    if (examiner) return safe ?? '/examiner';
    if (safe?.startsWith('/examiner')) return '/?notExaminer=1';
    return safe ?? '/';
  }
}
