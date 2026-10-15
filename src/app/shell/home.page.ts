import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LIMITS, normalizeAccessCode } from '@exam/contracts';

@Component({
  selector: 'app-home-page',
  imports: [FormField, FormRoot, RouterLink],
  template: `
    <section class="hero">
      <div class="panel">
        <p class="eyebrow">Candidates</p>
        <h1>Join an exam</h1>
        <form [formRoot]="joinForm" (submit)="join($event)" class="join">
          <label for="code">Access code</label>
          <div class="row">
            <input
              id="code"
              class="code-input"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              [formField]="joinForm.code"
              aria-describedby="code-error"
            />
            <button type="submit" class="primary">Continue</button>
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
        <p class="eyebrow">Examiners</p>
        <h2>Create timed exams</h2>
        <p class="muted">
          Server-authoritative timers, server-side grading, and answer keys that never reach the browser.
        </p>
        <a class="button" routerLink="/examiner">Open dashboard</a>
      </div>
    </section>
  `,
  styles: `
    .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1.25rem; margin-top: 2rem; }
    h1, h2 { margin-top: 0.25rem; }
    .join { display: grid; gap: 0.4rem; }
    .row { display: flex; gap: 0.5rem; }
    .code-input { font: 600 1.4rem/1 var(--mono); letter-spacing: 0.2em; text-transform: uppercase; width: 100%; }
  `,
})
export class HomePage {
  readonly #router = inject(Router);

  protected readonly model = signal({ code: '' });
  protected readonly joinForm = form(this.model, (p) => {
    required(p.code, { message: 'Enter the code your examiner gave you.' });
    maxLength(p.code, LIMITS.accessCodeLength + 2);
    pattern(p.code, /^\s*[A-Za-z0-9]{6}\s*$/, {
      message: `Codes are ${LIMITS.accessCodeLength} letters or digits.`,
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
