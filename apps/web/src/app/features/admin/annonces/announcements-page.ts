import { Component, DOCUMENT, computed, inject, resource, signal } from '@angular/core';
import { type PostDto, schoolToday } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { LoadState } from '../../../shared/components/load-state';
import { SchoolYears } from '../../../shared/data/school-years';
import { Alert, Button, EmptyState, Modal, Pagination } from '../../../shared/ui';
import { longDate } from '../../../shared/utils/format';
import { AnnouncementForm } from './announcement-form';
import { audienceLabel, audienceOptions } from './audience';

const PAGE_SIZE = 10;

/** Announcements of the school: write one for everyone, a section or a class, read the latest, delete one. */
@Component({
  selector: 'app-admin-announcements-page',
  imports: [Alert, AnnouncementForm, Button, EmptyState, LoadState, Modal, Pagination],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Annonces</h1>
        <p class="t-muted">Informez tout le collège, une section ou une classe. Les élèves concernés les voient sur leur page d’accueil.</p>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    <div class="grid-3">
      <section class="card card--panel" aria-labelledby="new-post-title">
        <h2 id="new-post-title" class="t-h3">Nouvelle annonce</h2>
        <app-announcement-form [audiences]="audiences()" (created)="onCreated($event)" />
      </section>

      <section class="span-2 stack" aria-labelledby="posts-title">
        <h2 id="posts-title" class="t-h2" tabindex="-1">Dernières annonces</h2>
        <app-load-state [ref]="posts" label="Chargement des annonces…" />
        @if (posts.hasValue()) {
          @if (posts.value().items.length) {
            <ul class="stack stack--sm" role="list">
              @for (p of posts.value().items; track p.id) {
                <li>
                  <article class="card card--panel" [attr.aria-labelledby]="'annonce-' + p.id">
                    <div class="card__header">
                      <h3 class="t-h3" [id]="'annonce-' + p.id">{{ p.title }}</h3>
                      <button cdlsButton variant="danger" size="sm" type="button" (click)="askDelete(p)">
                        Supprimer<span class="visually-hidden"> l’annonce « {{ p.title }} »</span>
                      </button>
                    </div>
                    <p class="list__meta">{{ meta(p) }}</p>
                    <p class="post-body">{{ p.body }}</p>
                  </article>
                </li>
              }
            </ul>
            <cdls-pagination [total]="posts.value().total" [pageSize]="pageSize" [(page)]="page" label="Pages des annonces" noun="annonces" />
          } @else {
            <cdls-empty-state icon="bell" title="Aucune annonce" description="Publiez la première avec le formulaire." />
          }
        }
      </section>
    </div>

    <cdls-modal title="Supprimer l’annonce ?" [(open)]="deleteOpen" (closed)="afterDelete()">
      <div class="stack stack--sm">
        <p>« {{ toDelete()?.title }} » ne sera plus visible par personne.</p>
        @if (deleteError()) {
          <cdls-alert tone="danger">{{ deleteError() }}</cdls-alert>
        }
      </div>
      <div class="modal__footer">
        <button cdlsButton variant="secondary" type="button" (click)="deleteOpen.set(false)">Annuler</button>
        <button cdlsButton variant="danger" type="button" (click)="remove()">{{ deleting() ? 'Suppression…' : 'Supprimer' }}</button>
      </div>
    </cdls-modal>
  `,
  styles: `
    .post-body {
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
  `,
})
export class AnnouncementsPage {
  readonly #api = inject(ApiClient);
  readonly #years = inject(SchoolYears);
  readonly #document = inject(DOCUMENT);
  #deleted = false;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly page = signal(1);

  protected readonly posts = resource({
    params: () => ({ page: this.page(), pageSize: PAGE_SIZE }),
    loader: ({ params }) => this.#api.calendar.posts(params),
  });
  readonly #classes = resource({
    params: () => (this.#years.settled() ? { yearId: this.#years.year()?.id } : undefined),
    loader: ({ params }) => this.#api.school.classes({ schoolYearId: params.yearId }),
  });
  readonly #sections = resource({ loader: () => this.#api.school.sections() });

  readonly #classList = computed(() => (this.#classes.hasValue() ? this.#classes.value() : []));
  readonly #sectionList = computed(() => (this.#sections.hasValue() ? this.#sections.value() : []));
  /** The whole school is always offered; the sections and classes join it once loaded. */
  protected readonly audiences = computed(() => audienceOptions(this.#classList(), this.#sectionList()));

  protected readonly notice = signal<string | null>(null);
  protected readonly toDelete = signal<PostDto | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected meta(p: PostDto): string {
    const who = audienceLabel(p, this.#classList(), this.#sectionList());
    return [p.authorName, `pour ${who}`, `le ${longDate(schoolToday(new Date(p.createdAt)))}`].join(', ');
  }

  /** The deleted post's button is gone: focus moves to the list heading instead. */
  protected afterDelete(): void {
    if (!this.#deleted) return;
    this.#deleted = false;
    // After the dialog has handed focus back to its (now removed) opener.
    this.#document.defaultView?.setTimeout(() => this.#document.getElementById('posts-title')?.focus(), 0);
  }

  protected onCreated(post: PostDto): void {
    this.notice.set(`L’annonce « ${post.title} » est publiée.`);
    this.page.set(1);
    this.posts.reload();
  }

  protected askDelete(p: PostDto): void {
    this.toDelete.set(p);
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const p = this.toDelete();
    if (!p || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.#api.calendar.deletePost(p.id);
      this.#deleted = true;
      this.deleteOpen.set(false);
      this.notice.set(`L’annonce « ${p.title} » est supprimée.`);
      // Deleting the last post of the last page: go back to the page before, which still exists.
      const total = this.posts.hasValue() ? this.posts.value().total - 1 : 0;
      this.page.update((n) => Math.min(n, Math.max(1, Math.ceil(total / PAGE_SIZE))));
      this.posts.reload();
    } catch (error) {
      this.deleteError.set(`L’annonce n’a pas été supprimée. ${apiMessage(error)}`);
    } finally {
      this.deleting.set(false);
    }
  }
}
