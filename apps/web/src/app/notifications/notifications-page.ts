import { Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import type { NotificationDto, NotificationPreferencesDto } from '@cdls/shared';
import { apiMessage, ApiClient } from '../core/api/api-client';
import { LoadState } from '../eleve/shared/load-state';
import { Alert, Badge, Button, EmptyState, Pagination, Segmented, type SegmentOption } from '../ui';
import { kindLabel, kindTone, receivedAt } from './notification-view';
import { NotificationsStore } from './notifications-store';

const PAGE_SIZE = 20;

/**
 * « Notifications » of the student and teacher spaces: what changed for the user (sessions cancelled or
 * moved, events, homework, grades), newest first, with « marquer comme lu » one by one or all at once,
 * and the e-mail preference (off until the user turns it on).
 */
@Component({
  selector: 'app-notifications-page',
  imports: [
    RouterLink,
    FormField,
    LoadState,
    Alert,
    Badge,
    Button,
    EmptyState,
    Pagination,
    Segmented,
  ],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Notifications</h1>
        <p class="t-muted">{{ summary() }}</p>
      </div>
      @if (store.unread() > 0) {
        <div class="page__header-actions">
          <button
            cdlsButton
            variant="secondary"
            type="button"
            [disabled]="busy()"
            (click)="markAll()"
          >
            Tout marquer comme lu
          </button>
        </div>
      }
    </div>

    <div class="notif-layout">
      <section class="card card--panel" aria-labelledby="notif-list-title">
        <div class="card__header">
          <h2 id="notif-list-title" class="t-h3">
            {{ unreadOnly() ? 'Non lues' : 'Toutes les notifications' }}
          </h2>
          <cdls-segmented legend="Afficher" [options]="filters" [(value)]="filter" />
        </div>

        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <app-load-state [ref]="list" label="Chargement des notifications…" />
        @if (list.hasValue()) {
          @if (list.value().items.length) {
            <ul class="list notif-list" role="list">
              @for (n of list.value().items; track n.id) {
                <li [class.notif--unread]="!n.readAt">
                  <span class="notif__marker" aria-hidden="true"></span>
                  <div class="list__main stack--sm">
                    <p class="notif__meta">
                      <cdls-badge [tone]="tone(n)">{{ label(n) }}</cdls-badge>
                      <span class="list__meta">{{ when(n) }}</span>
                      @if (!n.readAt) {
                        <span class="visually-hidden">, non lue</span>
                      }
                    </p>
                    <h3 class="notif__title">{{ n.title }}</h3>
                    <p>{{ n.body }}</p>
                    <p class="notif__actions">
                      @if (n.link) {
                        <a [routerLink]="n.link" (click)="open(n)"
                          >Voir<span class="visually-hidden"> : {{ n.title }}</span></a
                        >
                      }
                      @if (!n.readAt) {
                        <button
                          cdlsButton
                          variant="tertiary"
                          size="sm"
                          type="button"
                          [disabled]="busy()"
                          (click)="markRead(n)"
                        >
                          Marquer comme lue<span class="visually-hidden"> : {{ n.title }}</span>
                        </button>
                      }
                    </p>
                  </div>
                </li>
              }
            </ul>
            <cdls-pagination
              label="Pages des notifications"
              noun="notifications"
              [total]="list.value().total"
              [pageSize]="pageSize"
              [(page)]="page"
            />
          } @else {
            <cdls-empty-state
              icon="bell"
              [title]="unreadOnly() ? 'Tout est lu' : 'Aucune notification'"
              description="Vous serez prévenu ici quand une séance est annulée ou déplacée, quand un devoir est donné et quand une note est publiée."
            />
          }
        }
      </section>

      <section class="card card--panel" aria-labelledby="notif-mail-title">
        <h2 id="notif-mail-title" class="t-h3">Par e-mail</h2>
        <app-load-state [ref]="preferences" label="Chargement de vos préférences…" />
        @if (preferences.hasValue()) {
          <label class="check">
            <input
              #mailCheckbox
              type="checkbox"
              [formField]="prefsForm.emailEnabled"
              aria-describedby="notif-mail-help"
              (change)="savePreferences(mailCheckbox.checked)"
            />
            <span>Recevoir aussi ces notifications par e-mail</span>
          </label>
          <p class="field__helper" id="notif-mail-help">
            Un seul message regroupe les nouvelles de quelques minutes, à l’adresse de votre compte.
            Rien n’est envoyé pour une séance déjà passée.
          </p>
          @if (prefsMessage(); as message) {
            <cdls-alert [tone]="prefsFailed() ? 'danger' : 'success'">{{ message }}</cdls-alert>
          }
        }
      </section>
    </div>
  `,
  styles: `
    .notif-layout {
      display: grid;
      gap: var(--space-6);
      align-items: start;
    }
    @media (min-width: 64rem) {
      .notif-layout {
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      }
    }
    .card__header {
      flex-wrap: wrap;
      align-items: center;
    }
    .notif-list > li {
      gap: var(--space-3);
    }
    .notif__marker {
      flex: none;
      width: 0.5rem;
      height: 0.5rem;
      margin-top: 0.55rem;
      border-radius: 50%;
    }
    .notif--unread .notif__marker {
      background: var(--color-accent-text);
    }
    .notif__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }
    .notif__title {
      font-size: 1rem;
      line-height: 1.4;
      color: var(--color-heading);
      font-weight: 500;
    }
    .notif--unread .notif__title {
      font-weight: 700;
    }
    .notif__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      align-items: center;
    }
    /* 44 px targets on phones. */
    .notif__actions a,
    .notif__actions button {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      min-width: 2.75rem;
    }
  `,
})
export class NotificationsPage {
  readonly #api = inject(ApiClient);
  protected readonly store = inject(NotificationsStore);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly filters: SegmentOption[] = [
    { value: 'all', label: 'Toutes' },
    { value: 'unread', label: 'Non lues' },
  ];
  protected readonly filter = signal<string | null>('all');
  protected readonly unreadOnly = computed(() => this.filter() === 'unread');
  /** Back to the first page when the filter changes. */
  protected readonly page = linkedSignal({ source: this.unreadOnly, computation: () => 1 });
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  readonly #now = signal(new Date());

  protected readonly list = resource({
    params: () => ({
      page: this.page(),
      pageSize: PAGE_SIZE,
      unread: this.unreadOnly() || undefined,
    }),
    loader: ({ params }) => this.#api.notifications.list(params),
  });
  protected readonly preferences = resource({
    loader: () => this.#api.notifications.preferences(),
  });

  /** The form's model follows what the API says, then what the user ticks. */
  readonly #prefs = linkedSignal<NotificationPreferencesDto>(() =>
    this.preferences.hasValue() ? this.preferences.value() : { emailEnabled: false },
  );
  protected readonly prefsForm = form(this.#prefs);
  protected readonly prefsMessage = signal<string | null>(null);
  protected readonly prefsFailed = signal(false);

  protected readonly summary = computed(() => {
    const unread = this.store.unread();
    return unread === 0
      ? 'Tout est lu. Les changements qui vous concernent arrivent ici.'
      : `${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}.`;
  });

  protected tone = (n: NotificationDto) => kindTone(n.kind);
  protected label = (n: NotificationDto) => kindLabel(n.kind);
  protected when = (n: NotificationDto) => `Reçue ${receivedAt(n.createdAt, this.#now())}`;

  protected async markRead(n: NotificationDto): Promise<void> {
    await this.#run(async () => {
      const updated = await this.#api.notifications.markRead(n.id);
      this.#replace(updated);
    });
  }

  /** Following the link reads the notification (without waiting for it). */
  protected open(n: NotificationDto): void {
    if (!n.readAt)
      void this.#api.notifications.markRead(n.id).then(
        () => this.store.refresh(),
        () => undefined,
      );
  }

  protected async markAll(): Promise<void> {
    await this.#run(async () => {
      await this.#api.notifications.markAllRead();
      this.list.reload();
    });
  }

  /** Saves run one after the other, so two quick clicks cannot land in the wrong order. */
  #saving: Promise<void> = Promise.resolve();

  protected savePreferences(wanted: boolean): Promise<void> {
    this.#saving = this.#saving.then(() => this.#savePreferences(wanted));
    return this.#saving;
  }

  async #savePreferences(wanted: boolean): Promise<void> {
    this.prefsMessage.set(null);
    try {
      await this.#api.notifications.setPreferences({ emailEnabled: wanted });
      this.prefsFailed.set(false);
      this.prefsMessage.set(
        wanted
          ? 'C’est noté : vous recevrez aussi les notifications par e-mail.'
          : 'C’est noté : plus d’e-mail, les notifications restent ici.',
      );
    } catch (error) {
      this.#prefs.set({ emailEnabled: !wanted });
      this.prefsFailed.set(true);
      this.prefsMessage.set(apiMessage(error));
    }
  }

  async #run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      await work();
      await this.store.refresh();
      this.#now.set(new Date());
    } catch (error) {
      this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  #replace(updated: NotificationDto): void {
    this.list.update(
      (page) =>
        page && {
          ...page,
          items: this.unreadOnly()
            ? page.items.filter((n) => n.id !== updated.id)
            : page.items.map((n) => (n.id === updated.id ? updated : n)),
        },
    );
  }
}
