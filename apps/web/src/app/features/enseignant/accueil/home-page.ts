import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeStatus, HomeStatusRegion } from '../../../shared/components/home-status';
import { Button, Icon } from '../../../shared/ui';
import { dayTitle } from '../../../shared/utils/format';
import { GradingBlock } from './grading-block';
import { HomeworkBlock } from './homework-block';
import { LessonsBlock } from './lessons-block';
import { TeacherNewsBlock } from './news-block';
import { WatchBlock } from './watch-block';

/**
 * The teacher's one page: today's classes with their actions, then what is left to do, in blocks that each
 * load their own data and end with one link to their detail page. Phone: the blocks stack in this order.
 * From tablet width: Mes cours across the top, three blocks side by side, Annonces across the bottom.
 * « Nouvelle note » grades any class, not only today's. One permanent live region says when the page has
 * loaded and which block failed.
 */
@Component({
  selector: 'app-enseignant-home-page',
  imports: [Button, GradingBlock, HomeStatusRegion, HomeworkBlock, Icon, LessonsBlock, RouterLink, TeacherNewsBlock, WatchBlock],
  providers: [HomeStatus],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Bonjour {{ firstName() }}</h1>
        <p class="t-muted">{{ date() }}</p>
      </div>
      <div class="page__actions">
        <a cdlsButton routerLink="noter"><cdls-icon name="plus" />Nouvelle note</a>
      </div>
    </div>
    <app-home-status />
    <div class="home-grid">
      <app-lessons-block />
      <app-grading-block />
      <app-homework-block />
      <app-watch-block />
      <app-teacher-news-block />
    </div>
  `,
  styles: `
    .home-grid {
      display: grid;
      gap: var(--space-4);
      grid-template-columns: minmax(0, 1fr);
    }
    @media (min-width: 48rem) {
      .home-grid {
        gap: var(--space-6);
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class TeacherHomePage {
  readonly #auth = inject(AuthStore);
  /** The school clock moves on by itself (a page left open follows midnight; the blocks reload for the new day). */
  readonly #clock = inject(SchoolClock);
  protected readonly date = computed(() => dayTitle(this.#clock.today()));
  protected readonly firstName = computed(() => this.#auth.user()?.firstName ?? '');
}
