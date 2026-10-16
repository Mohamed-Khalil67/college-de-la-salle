import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SubjectId } from '@exam/data-access-curriculum';
import { injectPracticeCatalog } from '@exam/data-access-curriculum/practice';
import { ArCountPipe, BidiIsolate } from '@exam/ui-arabic';

/**
 * Free practice exams listed by examiners for a subject. Each card opens the regular timed runner
 * (`/take/CODE`): server-minted timer, visibility tracking, auto-submit. No account needed.
 */
@Component({
  selector: 'portal-practice-exams',
  imports: [RouterLink, ArCountPipe, BidiIsolate],
  template: `
    <section class="practice" [attr.aria-labelledby]="headingId()" data-testid="practice-exams">
      <h2 [id]="headingId()">اختبارات تدريبية مؤقَّتة</h2>
      <p class="muted">
        تدرَّب في ظروف تحاكي الامتحان: وقتٌ يحدِّده الخادم، وتسليمٌ تلقائي عند انتهائه. لا يلزمك حساب.
      </p>
      @if (catalog.exams().length) {
        <ul class="cards">
          @for (exam of catalog.exams(); track exam.examId) {
            <li>
              <a class="card" [routerLink]="['/take', exam.code]">
                <span class="title" examIsolate>{{ exam.title }}</span>
                <span class="meta">
                  {{ exam.durationSeconds / 60 | arCount: 'minute' }} ·
                  {{ exam.questionCount | arCount: 'question' }}
                </span>
                <span class="go" aria-hidden="true">ابدأ ←</span>
              </a>
            </li>
          }
        </ul>
      } @else if (catalog.loading()) {
        <p class="muted" aria-busy="true">جارٍ تحميل الاختبارات المتاحة…</p>
      } @else {
        <p class="muted empty">لا توجد اختبارات تدريبية منشورة لهذه المادة حاليًّا. إن كان لديك رمز اختبار، أدخِله في صفحة <a routerLink="/exams">الاختبارات</a>.</p>
      }
    </section>
  `,
  styles: `
    h2 { margin-block: 0 0.25rem; }
    .cards { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr)); }
    .card { display: grid; gap: 0.25rem; block-size: 100%; padding-block: 0.9rem; padding-inline: 1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); text-decoration: none; }
    .card:hover, .card:focus-visible { border-color: var(--accent); background: var(--accent-soft); }
    .title { font-family: var(--font-display); font-weight: 700; font-size: 1.2rem; color: var(--accent-strong); }
    .meta { font-size: 0.85rem; color: var(--muted); }
    .go { font-weight: 600; color: var(--terracotta-strong); }
  `,
})
export class PracticeExams {
  readonly subjectId = input.required<SubjectId>();
  protected readonly headingId = () => `practice-${this.subjectId()}`;
  protected readonly catalog = injectPracticeCatalog(() => this.subjectId());
}
