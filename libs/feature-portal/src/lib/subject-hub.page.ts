import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurriculumStore } from '@exam/data-access-curriculum';
import { ContextModuleView } from './ui/context-module';
import { PracticeExams } from './ui/practice-exams';
import { SyllabusTree } from './ui/syllabus-tree';

/**
 * `/subjects/:subjectId` — one reusable layout for every subject: overview, tracks, syllabus,
 * objectives, study guides, background reading and timed practice. Prerendered per subject.
 */
@Component({
  selector: 'portal-subject-hub-page',
  imports: [RouterLink, ContextModuleView, PracticeExams, SyllabusTree],
  template: `
    @if (subject(); as s) {
      <header class="page-header">
        <p class="eyebrow">المواد الدراسية</p>
        <h1>{{ s.name }}</h1>
        <p class="lead">{{ s.tagline }}</p>
        <p class="tracks">
          الشُّعب:
          @for (track of tracks(); track track.id) {
            <span class="chip">{{ track.name }}</span>
          }
        </p>
      </header>

      <section class="panel overview" aria-labelledby="overview-title">
        <h2 id="overview-title">نظرة عامة</h2>
        <p class="exam-text">{{ s.overview }}</p>
        @if (s.notation; as notation) {
          <p class="notation">
            من رموز المادة: <bdi class="formula" dir="ltr" lang="en" data-testid="notation">{{ notation }}</bdi>
          </p>
        }
      </section>

      <section aria-labelledby="syllabus-title">
        <h2 id="syllabus-title">المنهج</h2>
        <portal-syllabus-tree [nodes]="s.syllabus" />
      </section>

      <div class="columns">
        <section class="panel" aria-labelledby="objectives-title">
          <h2 id="objectives-title">أهداف التعلّم</h2>
          <ul>
            @for (objective of s.objectives; track $index) {
              <li>{{ objective }}</li>
            }
          </ul>
        </section>
        <section class="panel" aria-labelledby="guides-title">
          <h2 id="guides-title">أدلّة المذاكرة</h2>
          <dl class="guides">
            @for (guide of s.studyGuides; track guide.id) {
              <div>
                <dt>{{ guide.title }}</dt>
                <dd>{{ guide.description }}</dd>
              </div>
            }
          </dl>
        </section>
      </div>

      @for (module of s.contextModules; track module.id) {
        <section class="panel">
          <portal-context-module [module]="module" />
        </section>
      }

      <portal-practice-exams [subjectId]="s.id" />
    } @else {
      <section class="panel" role="alert">
        <h1>المادة غير موجودة</h1>
        <p>لم نجد مادة بهذا العنوان. اختر من <a routerLink="/sections/arabic">مواد القسم العربي</a>.</p>
      </section>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
    h1 { margin-block: 0.25rem 0.5rem; }
    h2 { margin-block-start: 0; }
    .lead { font-size: 1.15rem; color: var(--muted); margin-block-end: 0.5rem; }
    .tracks { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0; }
    .chip { padding-block: 0.1rem; padding-inline: 0.7rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
    .notation { margin-block-end: 0; }
    .formula { font-family: var(--font-latin); font-size: 1.2rem; font-weight: 700; color: var(--terracotta-strong); unicode-bidi: isolate; white-space: nowrap; }
    .columns { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr)); }
    .guides { margin: 0; display: grid; gap: 0.75rem; }
    .guides dt { font-weight: 700; }
    .guides dd { margin: 0; color: var(--muted); }
  `,
})
export class SubjectHubPage {
  /** Bound from the `:subjectId` route parameter (withComponentInputBinding). */
  readonly subjectId = input.required<string>();

  protected readonly store = inject(CurriculumStore);

  protected readonly subject = computed(() => this.store.subject(this.subjectId()));
  protected readonly tracks = computed(() => {
    const s = this.subject();
    return s ? this.store.tracksFor(s) : [];
  });
}
