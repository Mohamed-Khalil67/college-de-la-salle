import { Component, computed, inject, resource } from '@angular/core';
import type { ContactMessageDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { HomeBlock } from '../../../shared/components/home-block';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { longDate } from '../../../shared/utils/format';
import { messagesView } from './admin-home-views';

/** « Messages »: the contact-form messages nobody has handled yet, the newest first. */
@Component({
  selector: 'app-messages-block',
  imports: [HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Messages"
      headingId="bloc-messages"
      [state]="s"
      link="messages"
      linkLabel="Boîte de réception"
      loadingLabel="Chargement des messages…"
      emptyText="Aucun nouveau message. Ceux du formulaire de contact du site arriveront ici."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <p class="stat">
          <span class="stat__value tabular">{{ s.data.waiting }}</span>
          <span class="stat__label">{{ s.data.waiting > 1 ? 'messages en attente' : 'message en attente' }}</span>
        </p>
        <ul class="list" role="list" aria-label="Derniers messages">
          @for (m of s.data.latest; track m.id) {
            <li>
              <div class="list__main">
                <p>{{ m.subject }}</p>
                <p class="list__meta">{{ meta(m) }}</p>
              </div>
            </li>
          }
        </ul>
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .stat {
      margin: 0;
    }
  `,
})
export class MessagesBlock {
  readonly #api = inject(ApiClient);
  readonly #waiting = resource({ loader: () => this.#api.contact.messages({ handled: false, pageSize: 3 }) });
  protected readonly state = computed(() => blockState(snapshotOf(this.#waiting), messagesView));

  protected reload(): void {
    this.#waiting.reload();
  }

  protected meta(m: ContactMessageDto): string {
    return `${m.name}, le ${longDate(m.createdAt.slice(0, 10))}`;
  }
}
