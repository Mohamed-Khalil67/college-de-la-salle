import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeStatus, HomeStatusRegion } from '../../../shared/components/home-status';
import { Button, Icon } from '../../../shared/ui';
import { dayTitle } from '../../../shared/utils/format';
import { ApprovalsBlock } from './approvals-block';
import { ClassesBlock } from './classes-block';
import { MessagesBlock } from './messages-block';
import { AdminNewsBlock } from './news-block';
import { ReportsBlock } from './reports-block';
import { RolesBlock } from './roles-block';
import { YearBlock } from './year-block';

/**
 * The administration's one page: what is checked every day, in blocks that each load their own data and end
 * with one link to their detail page. Phone: the blocks stack in this order. From tablet width: À valider,
 * Messages and Classes side by side, Bulletins across the row, then Rôles, Année scolaire and Annonces.
 * One permanent live region says when the page has loaded and which block failed.
 */
@Component({
  selector: 'app-admin-home-page',
  imports: [
    AdminNewsBlock,
    ApprovalsBlock,
    Button,
    ClassesBlock,
    HomeStatusRegion,
    Icon,
    MessagesBlock,
    ReportsBlock,
    RolesBlock,
    RouterLink,
    YearBlock,
  ],
  providers: [HomeStatus],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Bonjour {{ firstName() }}</h1>
        <p class="t-muted">{{ date() }}</p>
      </div>
      <div class="page__actions">
        <a cdlsButton variant="secondary" routerLink="utilisateurs" [queryParams]="{ action: 'importer' }">
          <cdls-icon name="upload" />Importer une liste
        </a>
        <a cdlsButton routerLink="utilisateurs" [queryParams]="{ action: 'creer' }">
          <cdls-icon name="plus" />Ajouter un compte
        </a>
      </div>
    </div>
    <app-home-status />
    <div class="home-grid">
      <app-approvals-block />
      <app-messages-block />
      <app-classes-block />
      <app-reports-block />
      <app-roles-block />
      <app-year-block />
      <app-admin-news-block />
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
export class AdminHomePage {
  readonly #auth = inject(AuthStore);
  /** The school clock moves on by itself: a page left open follows midnight. */
  readonly #clock = inject(SchoolClock);
  protected readonly date = computed(() => dayTitle(this.#clock.today()));
  protected readonly firstName = computed(() => this.#auth.user()?.firstName ?? '');
}
