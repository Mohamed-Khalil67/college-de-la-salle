import { Component, computed, DestroyRef, inject, input, linkedSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { Icon } from '../ui';
import { bellLabel } from './notification-view';
import { NotificationsStore } from './notifications-store';

/** Polling interval of the unread count (the count also follows every navigation). */
const REFRESH_MS = 60_000;

/**
 * The bell of the app bar: a link to the notifications page whose name says how many are unread (the gold
 * dot only repeats it). The count is announced politely when it grows, not on every page.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, Icon],
  template: `
    <a class="app-bar__icon-btn" [routerLink]="link()" [attr.aria-label]="label()">
      <cdls-icon name="bell" />
      @if (store.unread() > 0) {
        <span class="app-bar__dot" aria-hidden="true"></span>
      }
    </a>
    <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
  `,
})
export class NotificationBell {
  /** The notifications page of the space (`/eleve/notifications`). */
  readonly link = input.required<string>();

  protected readonly store = inject(NotificationsStore);
  protected readonly label = computed(() => bellLabel(this.store.unread()));
  /** Spoken when the count grows, not when it falls (reading one is the user's own doing). */
  protected readonly announcement = linkedSignal<number, string>({
    source: this.store.unread,
    computation: (unread, previous) =>
      unread > (previous?.source ?? 0) ? bellLabel(unread) : (previous?.value ?? ''),
  });

  constructor() {
    void this.store.refresh();
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.store.refresh());
    const timer = setInterval(() => void this.store.refresh(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
