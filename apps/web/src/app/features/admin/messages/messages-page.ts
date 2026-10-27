import { Component, ElementRef, Injector, afterNextRender, afterRenderEffect, computed, inject, linkedSignal, resource, signal, viewChild } from '@angular/core';
import type { ContactMessageDto, Paginated } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Badge, Button, EmptyState, Icon, Pagination, Tabs, type TabItem } from '../../../shared/ui';
import { plural } from '../shared/admin-format';
import { ConfirmModal } from '../../../shared/components/confirm-modal';
import {
  bulkHandledNotice,
  formatReceived,
  handledQuery,
  isMessageFilter,
  keepSelectable,
  mailtoAddress,
  MESSAGE_FILTERS,
  type MessageFilter,
  pageAfterRemoval,
  replyMailto,
  selectAllState,
  selectableIds,
  toggleSelected,
} from './messages-format';

const PAGE_SIZE = 20;

const EMPTY: Readonly<Record<MessageFilter, { readonly title: string; readonly description: string }>> = {
  waiting: { title: 'Aucun message à traiter', description: 'Les nouveaux messages du formulaire de contact arrivent ici.' },
  handled: { title: 'Aucun message traité', description: 'Les messages marqués comme traités sont rangés ici.' },
  all: { title: 'Aucun message reçu', description: 'Les messages envoyés depuis la page Contact du site arrivent ici.' },
};

/**
 * Messages sent from the public contact form: read them, answer by e-mail, mark them handled (one by one
 * or a selection), delete the unwanted ones.
 */
@Component({
  selector: 'app-messages-page',
  imports: [Alert, Badge, Button, ConfirmModal, EmptyState, Icon, Pagination, Tabs],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Messages</h1>
        <p class="t-muted">{{ subtitle() }}</p>
      </div>
    </div>

    <div #noticeBox class="notice-box" tabindex="-1">
      @if (notice()) {
        <cdls-alert tone="success">{{ notice() }}</cdls-alert>
      }
    </div>

    <cdls-tabs [tabs]="tabs()" label="État des messages" [(value)]="tab">
      @if (actionError()) {
        <cdls-alert tone="danger">{{ actionError() }}</cdls-alert>
      }
      @if (messages.error()) {
        <cdls-alert tone="danger">{{ errorText(messages.error()) }}</cdls-alert>
      } @else if (shown(); as list) {
        @if (list.items.length) {
          @if (selectable().length) {
            <div class="bulk" role="group" aria-label="Sélection des messages à traiter">
              <label class="check">
                <input type="checkbox" [checked]="allState() === 'all'" [indeterminate]="allState() === 'some'" (change)="selectAll($event)" />
                <span>Tout sélectionner sur cette page</span>
              </label>
              <button cdlsButton size="sm" type="button" [disabled]="bulkBusy()" (click)="handleSelected()">
                @if (bulkBusy()) {
                  Un instant…
                } @else {
                  <cdls-icon name="check" />Marquer la sélection comme traitée
                  @if (selected().size) {
                    ({{ selected().size }})
                  }
                }
              </button>
            </div>
          }
          <ul class="messages" role="list" [attr.aria-busy]="messages.isLoading()">
            @for (m of list.items; track m.id) {
              <li>
                <article class="card card--panel message" [attr.aria-labelledby]="'message-' + m.id">
                  <header class="message__head">
                    <div class="message__title">
                      @if (!m.handledAt) {
                        <label class="check">
                          <input type="checkbox" [checked]="selected().has(m.id)" (change)="select(m.id, $event)" />
                          <span class="visually-hidden">Sélectionner le message de {{ m.name }} : {{ m.subject }}</span>
                        </label>
                      }
                      <h2 class="t-h3" [id]="'message-' + m.id">{{ m.subject }}</h2>
                    </div>
                    @if (m.handledAt) {
                      <cdls-badge tone="neutral">Traité</cdls-badge>
                    } @else {
                      <cdls-badge tone="info">À traiter</cdls-badge>
                    }
                  </header>
                  <dl class="message__meta t-body-s">
                    <div>
                      <dt>De</dt>
                      <dd>
                        {{ m.name }}, <a [href]="'mailto:' + address(m.email)">{{ m.email }}</a>
                      </dd>
                    </div>
                    @if (m.phone) {
                      <div>
                        <dt>Téléphone</dt>
                        <dd>{{ m.phone }}</dd>
                      </div>
                    }
                    @if (m.track) {
                      <div>
                        <dt>Filière et classe</dt>
                        <dd>{{ m.track }}</dd>
                      </div>
                    }
                    <div>
                      <dt>Reçu le</dt>
                      <dd><time [attr.datetime]="m.createdAt">{{ received(m.createdAt) }}</time></dd>
                    </div>
                    @if (m.handledAt) {
                      <div>
                        <dt>Traité le</dt>
                        <dd>
                          <time [attr.datetime]="m.handledAt">{{ received(m.handledAt) }}</time>
                          @if (m.handledByName) {
                            par {{ m.handledByName }}
                          }
                        </dd>
                      </div>
                    }
                  </dl>
                  <p class="message__body">{{ m.message }}</p>
                  <div class="message__actions">
                    <a cdlsButton variant="secondary" size="sm" [href]="reply(m)">
                      <cdls-icon name="mail" />Répondre par e-mail<span class="visually-hidden"> à {{ m.name }}</span>
                    </a>
                    <button cdlsButton [variant]="m.handledAt ? 'tertiary' : 'primary'" size="sm" type="button" [disabled]="busyId() === m.id" (click)="toggle(m)">
                      @if (busyId() === m.id) {
                        Un instant…
                      } @else if (m.handledAt) {
                        Remettre à traiter<span class="visually-hidden"> : {{ m.subject }}</span>
                      } @else {
                        <cdls-icon name="check" />Marquer comme traité<span class="visually-hidden"> : {{ m.subject }}</span>
                      }
                    </button>
                    <button cdlsButton variant="tertiary" size="sm" type="button" (click)="askDelete(m)">
                      Supprimer<span class="visually-hidden"> le message : {{ m.subject }}</span>
                    </button>
                  </div>
                </article>
              </li>
            }
          </ul>
          <cdls-pagination [total]="list.total" [pageSize]="pageSize" noun="messages" label="Pagination des messages" [(page)]="page" />
        } @else {
          <cdls-empty-state icon="mail" [title]="empty().title" [description]="empty().description" />
        }
      } @else {
        <p class="loading-line" role="status">Chargement des messages…</p>
      }
    </cdls-tabs>

    <app-confirm-modal
      title="Supprimer ce message ?"
      confirmLabel="Supprimer le message"
      [danger]="true"
      [busy]="deleting()"
      [error]="deleteError()"
      [(open)]="deleteOpen"
      (confirmed)="remove()"
    >
      @if (toDelete(); as m) {
        <p>
          Le message de <strong>{{ m.name }}</strong> (« {{ m.subject }} ») sera supprimé définitivement. Cette action ne peut pas
          être annulée.
        </p>
      }
    </app-confirm-modal>
  `,
  styles: `
    .notice-box:focus {
      outline: none;
    }
    .notice-box:empty {
      display: none;
    }
    .bulk {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3) var(--space-4);
      margin-block-end: var(--space-4);
    }
    .check input:indeterminate {
      background: var(--color-primary);
      border-color: var(--color-primary);
    }
    .check input:indeterminate::before {
      height: 2px;
      clip-path: none;
      transform: scale(1);
    }
    .messages {
      display: grid;
      gap: var(--space-6);
      margin-block-end: var(--space-6);
    }
    .message {
      display: grid;
      gap: var(--space-4);
    }
    .message__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2) var(--space-4);
    }
    .message__title {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      min-width: 0;
    }
    .message__title .check input {
      margin-block-start: 0.3rem;
    }
    .message__head h2 {
      overflow-wrap: anywhere;
    }
    .message__meta {
      display: grid;
      gap: var(--space-1);
    }
    .message__meta div {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--space-2);
    }
    .message__meta dt {
      color: var(--color-muted);
    }
    .message__meta dt::after {
      content: ' :';
    }
    .message__meta dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .message__body {
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .message__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-3);
    }
  `,
})
export class MessagesPage {
  readonly #api = inject(ApiClient);
  readonly #injector = inject(Injector);
  private readonly noticeBox = viewChild.required<ElementRef<HTMLElement>>('noticeBox');

  protected readonly pageSize = PAGE_SIZE;
  protected readonly tab = signal<string>('waiting');
  protected readonly filter = computed<MessageFilter>(() => {
    const tab = this.tab();
    return isMessageFilter(tab) ? tab : 'waiting';
  });
  protected readonly page = linkedSignal({ source: this.filter, computation: () => 1 });

  protected readonly messages = resource({
    params: () => ({ handled: handledQuery(this.filter()), page: this.page() }),
    loader: ({ params }) => this.#api.contact.messages({ ...params, pageSize: PAGE_SIZE }),
  });
  /** The last page received, kept on screen while the next one loads. */
  protected readonly shown = linkedSignal<Paginated<ContactMessageDto> | undefined, Paginated<ContactMessageDto> | undefined>({
    source: () => (this.messages.hasValue() ? this.messages.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });
  /** How many messages wait, for the tab and the subtitle. */
  protected readonly waiting = resource({ loader: () => this.#api.contact.messages({ handled: false, pageSize: 1 }) });
  readonly #waitingCount = computed(() => (this.waiting.hasValue() ? this.waiting.value().total : null));

  protected readonly tabs = computed<TabItem[]>(() =>
    MESSAGE_FILTERS.map((f) => ({ ...f, count: f.id === 'waiting' ? this.#waitingCount() : undefined })),
  );
  protected readonly subtitle = computed(() => {
    const count = this.#waitingCount();
    const source = 'Messages envoyés depuis la page Contact du site';
    return count === null ? source : `${source} : ${plural(count, 'message à traiter', 'messages à traiter')}.`;
  });
  protected readonly empty = computed(() => EMPTY[this.filter()]);

  /** Waiting messages on screen: the only ones that can be selected. */
  protected readonly selectable = computed(() => selectableIds(this.shown()?.items ?? []));
  /** Selected for bulk handling; forgets the messages that leave the page or get handled. */
  protected readonly selected = linkedSignal<readonly string[], ReadonlySet<string>>({
    source: this.selectable,
    computation: (ids, previous) => keepSelectable(previous?.value ?? new Set<string>(), ids),
  });
  protected readonly allState = computed(() => selectAllState(this.selected(), this.selectable()));
  protected readonly bulkBusy = signal(false);

  protected readonly deleteOpen = signal(false);
  protected readonly toDelete = signal<ContactMessageDto | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly busyId = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** The list on screen when a deletion succeeded; once a newer one is rendered, the confirmation takes the focus. */
  #focusNoticeAfter: Paginated<ContactMessageDto> | undefined | null = null;

  constructor() {
    afterRenderEffect(() => {
      const shown = this.shown();
      if (this.#focusNoticeAfter === null || shown === this.#focusNoticeAfter) return;
      this.#focusNoticeAfter = null;
      this.noticeBox().nativeElement.focus();
    });
  }

  protected received(iso: string): string {
    return formatReceived(iso);
  }

  protected address(email: string): string {
    return mailtoAddress(email);
  }

  protected reply(message: ContactMessageDto): string {
    return replyMailto(message);
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les messages. Réessayez dans un instant.');
  }

  protected async toggle(message: ContactMessageDto): Promise<void> {
    const handled = !message.handledAt;
    this.busyId.set(message.id);
    this.actionError.set(null);
    try {
      await this.#api.contact.setHandled(message.id, handled);
      this.notice.set(
        handled ? `Message de ${message.name} marqué comme traité.` : `Message de ${message.name} remis à traiter.`,
      );
      if (this.filter() !== 'all') this.#stepBackIfEmptied(1);
      this.messages.reload();
      this.waiting.reload();
      // The message leaves this tab: keep the focus on the page, on the confirmation.
      afterNextRender(() => this.noticeBox().nativeElement.focus(), { injector: this.#injector });
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  protected select(id: string, event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.selected.update((selected) => toggleSelected(selected, id, on));
  }

  protected selectAll(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.selected.set(new Set(on ? this.selectable() : []));
  }

  protected async handleSelected(): Promise<void> {
    const ids = [...this.selected()];
    this.actionError.set(null);
    if (!ids.length) {
      this.actionError.set('Cochez d’abord les messages à marquer comme traités.');
      return;
    }
    this.bulkBusy.set(true);
    try {
      const { handled } = await this.#api.contact.handleMany(ids);
      this.notice.set(bulkHandledNotice(handled, ids.length));
      if (this.filter() === 'waiting') this.#stepBackIfEmptied(ids.length);
      this.messages.reload();
      this.waiting.reload();
      // The selection leaves this tab (and the bar with it when nothing waits): keep the focus on the page.
      afterNextRender(() => this.noticeBox().nativeElement.focus(), { injector: this.#injector });
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.bulkBusy.set(false);
    }
  }

  protected askDelete(message: ContactMessageDto): void {
    this.toDelete.set(message);
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const message = this.toDelete();
    if (!message) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.#api.contact.remove(message.id);
      this.actionError.set(null);
      this.notice.set(`Message de ${message.name} supprimé.`);
      this.deleteOpen.set(false);
      // The dialog gives the focus back to « Supprimer », which leaves with the message: once the list is
      // refreshed, the confirmation takes the focus instead.
      this.#focusNoticeAfter = this.shown();
      this.#stepBackIfEmptied(1);
      this.messages.reload();
      this.waiting.reload();
    } catch (error) {
      this.deleteError.set(apiMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }

  /** Back to the previous page when the messages that left were the last ones of this page. */
  #stepBackIfEmptied(removed: number): void {
    const onPage = this.shown()?.items.length ?? 0;
    this.page.update((page) => pageAfterRemoval(page, onPage, removed));
  }
}
