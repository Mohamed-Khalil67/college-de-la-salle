import { Component, inject, input, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LIMITS, normalizeAccessCode } from '@exam/contracts';
import { AuthStore } from '@exam/data-access-auth';
import { CandidateInvitationsStore } from '@exam/data-access-exams';
import { ArCountPipe, ArDatePipe, arabicErrorMessage, BidiIsolate, Star } from '@exam/ui-arabic';

/**
 * The candidates' page (/exams): enter a code, or — when signed in — pick from the exams you were
 * invited to. Accounts that were just granted examiner access can refresh their role here.
 */
@Component({
  selector: 'app-exams-home-page',
  imports: [FormField, FormRoot, RouterLink, Star, ArCountPipe, ArDatePipe, BidiIsolate],
  providers: [CandidateInvitationsStore],
  template: `
    <section class="hero">
      <exam-star [size]="34" />
      <h1>اخْتِبَارَاتٌ مُؤَقَّتَةٌ بِعَدْلٍ وَأَمَانَة</h1>
      <p class="lead">أدخِل رمز الاختبار الذي زوَّدك به المُمتحِن، أو افتح الرابط الذي أرسله إليك.</p>
    </section>

    @if (notAllowed()) {
      <p class="notice" role="status">
        {{ notAllowed() === 'super_admin' ? 'هذه الصفحة مقصورة على المشرف العام.' : 'هذا الحساب ليس من حسابات المُمتحِنين المعتمدة، لذا تُعرَض لك صفحة المُختبَرين.' }}
      </p>
    }
    @if (auth.hasAccount() && !auth.isExaminer()) {
      <div class="role-refresh">
        <p class="muted">مُنِحتَ صلاحية المُمتحِن للتوّ؟ حدِّث صلاحياتك دون الحاجة إلى تسجيل الخروج.</p>
        <button type="button" [disabled]="refreshing()" (click)="refreshRole()">
          {{ refreshing() ? 'جارٍ التحديث…' : 'تحديث صلاحياتي' }}
        </button>
        @if (refreshMessage(); as message) {
          <p class="hint" role="status">{{ message }}</p>
        }
      </div>
    }

    <section class="cards">
      <div class="panel join-panel">
        <p class="eyebrow">للمُختبَرين</p>
        <h2>الانضمام إلى اختبار</h2>
        <form [formRoot]="joinForm" (submit)="join($event)" class="join">
          <label for="code">رمز الاختبار</label>
          <div class="row">
            <input
              id="code"
              class="code-input ltr"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              placeholder="ABC234"
              [formField]="joinForm.code"
              aria-describedby="code-hint code-error"
            />
            <button type="submit" class="primary">متابعة</button>
          </div>
          <p id="code-hint" class="hint">ستة أحرف لاتينية أو أرقام، كما زوَّدك بها المُمتحِن.</p>
          <p id="code-error" class="field-error" aria-live="polite">
            @if (joinForm.code().touched()) {
              @for (error of joinForm.code().errors(); track error.kind) {
                {{ error.message }}
              }
            }
          </p>
        </form>
      </div>

      <div class="panel">
        <p class="eyebrow">الاختبارات المدعوّ إليها</p>
        @if (auth.hasAccount()) {
          @if (invites.invitations().length) {
            <ul class="invites" data-testid="invitations">
              @for (invite of invites.invitations(); track invite.examId) {
                <li>
                  <a [routerLink]="['/take', invite.code]" class="invite">
                    <span class="title" examIsolate>{{ invite.title }}</span>
                    <span class="meta">
                      {{ invite.durationSeconds / 60 | arCount: 'minute' }} · يُغلَق في
                      {{ invite.window.closesAt | arDate: 'short' }}
                    </span>
                  </a>
                </li>
              }
            </ul>
          } @else if (invites.loading()) {
            <p class="muted" aria-busy="true">جارٍ تحميل دعواتك…</p>
          } @else {
            <p class="muted">لا توجد اختبارات مدعوّ إليها حاليًّا بهذا الحساب.</p>
          }
        } @else {
          <p class="muted">
            بعض الاختبارات مقصورة على المدعوّين. سجِّل الدخول بالحساب الذي دُعيتَ به لترى اختباراتك هنا.
          </p>
          <a class="button" routerLink="/sign-in">تسجيل الدخول</a>
        }
      </div>
    </section>

    <p class="examiner-entry muted">
      هل أنت مُمتحِن؟ <a routerLink="/sign-in">سجِّل الدخول لإدارة اختباراتك</a>.
    </p>
  `,
  styles: `
    .hero { text-align: center; margin-block: 1rem 2rem; }
    .hero h1 { margin-block: 0.75rem 0.5rem; }
    .lead { max-inline-size: 40rem; margin-inline: auto; color: var(--muted); font-size: 1.1rem; }
    .notice { padding-block: 0.75rem; padding-inline: 1rem; border-radius: var(--radius); background: var(--warn-soft); color: var(--warn-strong); }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr)); gap: 1.25rem; }
    .join { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.4rem; }
    .row { display: flex; gap: 0.5rem; }
    .code-input { font: 600 1.4rem/1.4 var(--mono); letter-spacing: 0.2em; text-transform: uppercase; inline-size: 100%; min-inline-size: 0; text-align: center; }
    .invites { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
    .invite { display: grid; gap: 0.15rem; padding-block: 0.6rem; padding-inline: 0.85rem; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); text-decoration: none; }
    .invite:hover { border-color: var(--accent); background: var(--accent-soft); }
    .invite .title { font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; color: var(--accent-strong); }
    .invite .meta { font-size: 0.85rem; color: var(--muted); }
    .examiner-entry { text-align: center; margin-block-start: 2rem; }
    .role-refresh { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-block: 1rem; }
    .role-refresh p { margin: 0; }
  `,
})
export class ExamsHomePage {
  /** `?notAllowed=examiner|super_admin` — set by `roleGuard` when an account lacks the role. */
  readonly notAllowed = input<string | undefined>();

  protected readonly auth = inject(AuthStore);
  protected readonly invites = inject(CandidateInvitationsStore);
  readonly #router = inject(Router);
  protected readonly refreshing = signal(false);
  protected readonly refreshMessage = signal<string | null>(null);

  /** Picks up a role granted after sign-in (server re-check + forced token refresh). */
  protected async refreshRole(): Promise<void> {
    this.refreshing.set(true);
    this.refreshMessage.set(null);
    try {
      await this.auth.refreshClaims();
      if (this.auth.isSuperAdmin()) await this.#router.navigateByUrl('/admin');
      else if (this.auth.isExaminer()) await this.#router.navigateByUrl('/examiner');
      else this.refreshMessage.set('لم تتغيّر صلاحياتك: حسابك ليس في دليل المُمتحِنين.');
    } catch (error) {
      this.refreshMessage.set(arabicErrorMessage(error));
    } finally {
      this.refreshing.set(false);
    }
  }

  protected readonly model = signal({ code: '' });
  protected readonly joinForm = form(this.model, (p) => {
    required(p.code, { message: 'أدخِل الرمز الذي زوَّدك به المُمتحِن.' });
    maxLength(p.code, LIMITS.accessCodeLength + 2);
    pattern(p.code, /^\s*[A-Za-z0-9٠-٩۰-۹]{6}\s*$/, {
      message: 'يتكوَّن الرمز من ستة أحرف لاتينية أو أرقام.',
    });
  });

  protected join(event: Event): void {
    event.preventDefault();
    void submit(this.joinForm, async () => {
      await this.#router.navigate(['/take', normalizeAccessCode(this.model().code)]);
      return undefined;
    });
  }
}
