import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import type { LoginRequest, Role, SessionResponse, SessionUser } from '@cdls/shared';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Readonly<Record<Role, string>> = {
  student: '/eleve',
  teacher: '/enseignant',
  admin: '/admin',
};

/**
 * The signed-in user. The access token lives only in memory; the refresh token is an httpOnly cookie
 * the browser sends to /api/auth/refresh, so a reload restores the session without storing anything.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  readonly #http = inject(HttpClient);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #user = signal<SessionUser | null>(null);
  readonly #status = signal<AuthStatus>('unknown');
  #accessToken: string | null = null;
  #refreshing: Promise<boolean> | null = null;
  #restored: Promise<void> | null = null;

  readonly user = this.#user.asReadonly();
  readonly status = this.#status.asReadonly();
  readonly role = computed(() => this.#user()?.role ?? null);
  readonly displayName = computed(() => {
    const user = this.#user();
    return user ? `${user.firstName} ${user.lastName}` : '';
  });
  readonly initials = computed(() => {
    const user = this.#user();
    return user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : '';
  });
  readonly home = computed(() => {
    const role = this.role();
    return role ? HOME_BY_ROLE[role] : '/connexion';
  });

  get accessToken(): string | null {
    return this.#accessToken;
  }

  /** Restores the session once per page load (browser only); later calls wait for the same result. */
  restore(): Promise<void> {
    if (!this.#browser) return Promise.resolve();
    this.#restored ??= this.refresh().then(() => undefined);
    return this.#restored;
  }

  async login(credentials: LoginRequest): Promise<SessionUser> {
    const session = await firstValueFrom(
      this.#http.post<SessionResponse>('/api/auth/login', credentials, { withCredentials: true }),
    );
    this.#accept(session);
    this.#restored = Promise.resolve();
    return session.user;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.#http.post('/api/auth/logout', {}, { withCredentials: true }));
    } catch {
      // The session ends locally even if the server could not be reached.
    }
    this.#clear();
  }

  /** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
  refresh(): Promise<boolean> {
    this.#refreshing ??= firstValueFrom(
      this.#http.post<SessionResponse>('/api/auth/refresh', {}, { withCredentials: true }),
    )
      .then((session) => {
        this.#accept(session);
        return true;
      })
      .catch(() => {
        this.#clear();
        return false;
      })
      .finally(() => (this.#refreshing = null));
    return this.#refreshing;
  }

  #accept(session: SessionResponse): void {
    this.#accessToken = session.accessToken;
    this.#user.set(session.user);
    this.#status.set('authenticated');
  }

  #clear(): void {
    this.#accessToken = null;
    this.#user.set(null);
    this.#status.set('anonymous');
  }
}
