import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import type { ChangePasswordRequest, LoginRequest, Role, SessionResponse, SessionUser } from '@cdls/shared';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Readonly<Record<Role, string>> = {
  student: '/eleve',
  teacher: '/enseignant',
  admin: '/admin',
};

/** Where a user still on a temporary password (first sign-in, reset) must go first. */
export const FIRST_ACCESS = '/premier-acces';

/** The first page after signing in: the first-access page until a password is chosen, else the role's space. */
export function landingFor(user: Pick<SessionUser, 'role' | 'mustChangePassword'>): string {
  return user.mustChangePassword ? FIRST_ACCESS : HOME_BY_ROLE[user.role];
}

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
  /** Until the user has chosen a password, every page sends them to the first-access page. */
  readonly mustChangePassword = computed(() => this.#user()?.mustChangePassword ?? false);
  readonly home = computed(() => {
    const user = this.#user();
    return user ? landingFor(user) : '/connexion';
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

  /**
   * Chooses a new password. The API signs out every other session and answers with a fresh one for this
   * browser (new access token and refresh cookie), with mustChangePassword cleared.
   */
  async changePassword(body: ChangePasswordRequest): Promise<SessionUser> {
    const session = await firstValueFrom(
      this.#http.post<SessionResponse>('/api/auth/password', body, { withCredentials: true }),
    );
    this.#accept(session);
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

  /**
   * Fetches the current profile (section, class…) from /auth/me, which the API reads from the database
   * on every call. Unlike refresh() it keeps the tokens and the session: a network error changes nothing.
   */
  async reloadUser(): Promise<void> {
    try {
      this.#user.set(await firstValueFrom(this.#http.get<SessionUser>('/api/auth/me')));
    } catch {
      // Keep what we have: the next call will show an error if the session really ended.
    }
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
