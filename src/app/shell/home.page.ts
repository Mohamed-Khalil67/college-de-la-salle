import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LIMITS, normalizeAccessCode } from '@exam/contracts';
import { Star } from '@exam/ui-arabic';

@Component({
  selector: 'app-home-page',
  imports: [FormField, FormRoot, RouterLink, Star],
  template: `
    <section class="hero">
      <exam-star [size]="34" />
      <h1>اخْتِبَارَاتٌ مُؤَقَّتَةٌ بِعَدْلٍ وَأَمَانَة</h1>
      <p class="lead">
        يبدأ التوقيت على الخادم لحظة الضغط على «ابدأ»، ولا يغادر مفتاحُ الإجابة جهازَ المُمتحِن أبدًا.
      </p>
    </section>

    <section class="cards">
      <div class="panel">
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
              aria-describedby="code-error"
            />
            <button type="submit" class="primary">متابعة</button>
          </div>
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
        <p class="eyebrow">للمُمتحِنين</p>
        <h2>إنشاء اختبارات مؤقَّتة</h2>
        <p class="muted">
          توقيتٌ يحدِّده الخادم، وتصحيحٌ آليٌّ على الخادم، وأسئلةٌ مقاليةٌ تُصحِّحها بنفسك مع اقتراحٍ من الذكاء الاصطناعي.
        </p>
        <a class="button" routerLink="/examiner">فتح لوحة المُمتحِن</a>
      </div>
    </section>
  `,
  styles: `
    .hero { text-align: center; margin-block: 1rem 2rem; }
    .hero h1 { margin-block: 0.75rem 0.5rem; }
    .lead { max-inline-size: 40rem; margin-inline: auto; color: var(--muted); font-size: 1.1rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1.25rem; }
    .join { display: grid; gap: 0.4rem; }
    .row { display: flex; gap: 0.5rem; }
    .code-input { font: 600 1.4rem/1.4 var(--mono); letter-spacing: 0.2em; text-transform: uppercase; inline-size: 100%; text-align: center; }
  `,
})
export class HomePage {
  readonly #router = inject(Router);

  protected readonly model = signal({ code: '' });
  protected readonly joinForm = form(this.model, (p) => {
    required(p.code, { message: 'أدخِل الرمز الذي زوَّدك به المُمتحِن.' });
    maxLength(p.code, LIMITS.accessCodeLength + 2);
    pattern(p.code, /^\s*[A-Za-z0-9]{6}\s*$/, {
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
