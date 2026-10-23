import { Service, inject, signal } from '@angular/core';
import { ApiClient } from '../core/api/api-client';

/**
 * The unread count of the signed-in user, shared by the bell of the app bar and the notifications page
 * (marking read there updates the bell at once). Refreshed on every navigation and once a minute.
 */
@Service()
export class NotificationsStore {
  readonly #api = inject(ApiClient);
  readonly #unread = signal(0);
  readonly unread = this.#unread.asReadonly();

  /** Only the latest request may write the count: an older answer arriving late is dropped. */
  #latest = 0;

  async refresh(): Promise<void> {
    const mine = ++this.#latest;
    try {
      const { unread } = await this.#api.notifications.summary();
      if (mine === this.#latest) this.#unread.set(unread);
    } catch {
      // A failed count keeps the last one: the bell is a hint, the page shows the errors.
    }
  }

  set(unread: number): void {
    this.#unread.set(Math.max(0, unread));
  }
}
