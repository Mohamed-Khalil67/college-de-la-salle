import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import type { ExamStatus } from '@exam/contracts';
import { BidiIsolate } from './bidi-isolate';
import { formatCount, formatDate } from './arabic-format';

type Copied = 'link' | 'code' | 'message' | null;

/**
 * Everything an examiner needs to reach candidates: the direct link, the code, a ready-to-send
 * invitation message in Arabic, and one-click WhatsApp / e-mail sharing (e-mail pre-addresses the
 * roster in BCC). Nothing is sent by the app itself — these open the examiner's own apps.
 */
@Component({
  selector: 'exam-share-panel',
  imports: [BidiIsolate],
  template: `
    <section class="share" aria-labelledby="share-title" data-testid="share-panel">
      <h3 id="share-title">مشاركة الاختبار</h3>
      <div class="facts">
        <div>
          <span class="label">رمز الاختبار</span>
          <code class="code ltr" data-testid="share-code">{{ code() }}</code>
        </div>
        <div class="link">
          <span class="label">الرابط المباشر</span>
          <code class="ltr" data-testid="share-url">{{ url() }}</code>
        </div>
      </div>

      <div class="actions">
        <button type="button" (click)="copy('link', url())">{{ copied() === 'link' ? 'نُسِخ الرابط' : 'نسخ الرابط' }}</button>
        <button type="button" (click)="copy('code', code())">{{ copied() === 'code' ? 'نُسِخ الرمز' : 'نسخ الرمز' }}</button>
        <button type="button" (click)="copy('message', message())">
          {{ copied() === 'message' ? 'نُسِخت رسالة الدعوة' : 'نسخ رسالة الدعوة' }}
        </button>
        <a class="button" [href]="whatsappHref()" target="_blank" rel="noopener noreferrer">مشاركة عبر واتساب</a>
        <a class="button" [href]="mailHref()">
          {{ emails().length ? 'مراسلة المدعوّين بالبريد' : 'إرسال بالبريد' }}
        </a>
      </div>

      <details>
        <summary>معاينة رسالة الدعوة</summary>
        <p class="message exam-text" examIsolate data-testid="share-message">{{ message() }}</p>
      </details>
      @if (status() === 'DRAFT') {
        <p class="hint">الاختبار مسودة: لن يتمكّن أحد من بدئه حتى تنشره.</p>
      }
    </section>
  `,
  styles: `
    .share { display: grid; gap: 0.75rem; }
    h3 { margin: 0; font-size: 1.2rem; }
    .facts { display: flex; flex-wrap: wrap; gap: 1.5rem; }
    .label { display: block; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
    .code { font: 700 1.8rem/1.4 var(--mono); letter-spacing: 0.15em; color: var(--accent-strong); }
    .link { min-inline-size: 0; }
    .link code { word-break: break-all; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .actions > * { font-size: 0.9rem; padding-block: 0.4rem; padding-inline: 0.8rem; }
    details summary { cursor: pointer; font-weight: 600; color: var(--accent); }
    .message { margin-block: 0.5rem 0; padding-block: 0.75rem; padding-inline: 1rem; background: var(--surface-2); border-radius: var(--radius); font-size: 1rem; }
  `,
})
export class ExamSharePanel {
  readonly title = input.required<string>();
  readonly code = input.required<string>();
  readonly durationSeconds = input.required<number>();
  readonly opensAt = input.required<number>();
  readonly closesAt = input.required<number>();
  readonly status = input<ExamStatus>('PUBLISHED');
  /** Invited emails, pre-filled as BCC in the e-mail link. */
  readonly emails = input<readonly string[]>([]);

  readonly #origin = inject(DOCUMENT).location.origin;
  protected readonly copied = signal<Copied>(null);

  protected readonly url = computed(() => `${this.#origin}/take/${this.code()}`);

  protected readonly message = computed(() =>
    [
      'السلام عليكم ورحمة الله،',
      `أدعوك لأداء اختبار «${this.title()}».`,
      `• المدة: ${formatCount(Math.round(this.durationSeconds() / 60), 'minute')}`,
      `• متاح من ${formatDate(this.opensAt(), 'short')} إلى ${formatDate(this.closesAt(), 'short')}`,
      `• رابط الاختبار: ${this.url()}`,
      `• رمز الاختبار: ${this.code()}`,
      'بالتوفيق.',
    ].join('\n'),
  );

  protected readonly whatsappHref = computed(
    () => `https://wa.me/?text=${encodeURIComponent(this.message())}`,
  );

  protected readonly mailHref = computed(() => {
    const params = [
      `subject=${encodeURIComponent(`دعوة لأداء اختبار: ${this.title()}`)}`,
      `body=${encodeURIComponent(this.message())}`,
    ];
    if (this.emails().length) params.unshift(`bcc=${this.emails().map(encodeURIComponent).join(',')}`);
    return `mailto:?${params.join('&')}`;
  });

  protected async copy(what: Exclude<Copied, null>, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(what);
    } catch {
      this.copied.set(null);
    }
  }
}
