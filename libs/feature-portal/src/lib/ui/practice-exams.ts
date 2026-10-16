import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PageLang, SubjectId } from '@exam/contracts';
import { injectPracticeCatalog } from '@exam/data-access-curriculum/practice';
import { ArCountPipe, BidiIsolate } from '@exam/ui-arabic';

const UI = {
  title: { ar: 'اختبارات تدريبية مؤقَّتة', fr: "Examens d'entraînement chronométrés" },
  intro: {
    ar: 'تدرَّب في ظروف تحاكي الامتحان: وقتٌ يحدِّده الخادم، وتسليمٌ تلقائي عند انتهائه. لا يلزمك حساب.',
    fr: "Entraînez-vous dans les conditions de l'examen : le temps est géré par le serveur et la copie est rendue automatiquement à la fin. Aucun compte requis.",
  },
  empty: {
    ar: 'لا توجد اختبارات تدريبية منشورة لهذه المادة حاليًّا.',
    fr: "Aucun examen d'entraînement n'est publié pour cette matière pour le moment.",
  },
  loading: { ar: 'جارٍ تحميل الاختبارات المتاحة…', fr: 'Chargement des examens…' },
  start: { ar: 'ابدأ ←', fr: 'Commencer →' },
} as const;

const PLURAL_FR = new Intl.PluralRules('fr');

/**
 * Free practice exams listed by teachers for a subject. Each card opens the regular timed runner
 * (`/take/CODE`): server-minted timer, visibility tracking, auto-submit. No account needed.
 */
@Component({
  selector: 'portal-practice-exams',
  imports: [RouterLink, ArCountPipe, BidiIsolate],
  template: `
    <section class="grid gap-3" [attr.aria-labelledby]="headingId()" data-testid="practice-exams">
      <h2 [id]="headingId()" class="m-0" [attr.lang]="lang()">{{ heading() ?? ui.title[lang()] }}</h2>
      @if (showIntro()) {
        <p class="m-0 text-muted">{{ ui.intro[lang()] }}</p>
      }
      @if (catalog.exams().length) {
        <ul class="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          @for (exam of catalog.exams(); track exam.examId) {
            <li>
              <a
                class="grid h-full gap-1 rounded-xl border border-line bg-surface p-4 no-underline hover:border-accent hover:bg-accent-soft"
                [routerLink]="['/take', exam.code]"
              >
                <span class="text-lg font-bold text-accent-strong" examIsolate>{{ exam.title }}</span>
                <span class="text-sm text-muted">
                  @if (lang() === 'fr') {
                    {{ frMeta(exam.durationSeconds, exam.questionCount) }}
                  } @else {
                    {{ exam.durationSeconds / 60 | arCount: 'minute' }} · {{ exam.questionCount | arCount: 'question' }}
                  }
                </span>
                <span class="font-semibold text-accent" aria-hidden="true">{{ ui.start[lang()] }}</span>
              </a>
            </li>
          }
        </ul>
      } @else if (catalog.loading()) {
        <p class="m-0 text-muted" aria-busy="true">{{ ui.loading[lang()] }}</p>
      } @else {
        <p class="m-0 text-muted">{{ ui.empty[lang()] }}</p>
      }
    </section>
  `,
})
export class PracticeExams {
  readonly subjectId = input.required<SubjectId>();
  readonly lang = input<PageLang>('ar');
  /** Replaces the default heading (the bank page uses the subject's name). */
  readonly heading = input<string | null>(null);
  readonly showIntro = input(true);

  protected readonly ui = UI;
  protected readonly headingId = computed(() => `practice-${this.subjectId()}`);
  protected readonly catalog = injectPracticeCatalog(() => this.subjectId());

  protected frMeta(seconds: number, questions: number): string {
    const minutes = Math.round(seconds / 60);
    const noun = PLURAL_FR.select(questions) === 'one' ? 'question' : 'questions';
    return `${minutes} min · ${questions} ${noun}`;
  }
}
