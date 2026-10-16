import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, computed, inject, signal } from '@angular/core';
import {
  hasRole,
  normalizeEmail,
  parseRole,
  type RefreshRoleResponse,
  ROLE_CLAIM,
  type UserRole,
} from '@exam/contracts';
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { FIREBASE_APP, FIREBASE_AUTH, FIREBASE_PLATFORM_CONFIG } from './firebase.providers';

/** The role resolved for one account. `uid: null` = signed out. */
interface ResolvedClaims {
  readonly uid: string | null;
  readonly role: UserRole;
}

/**
 * Auth state and role as signals. `undefined` user = still resolving the persisted session.
 *
 * The role is the `role` custom claim (`super_admin` | `examiner` | `examinee`), set only by Cloud
 * Functions from the examiner directory. It's re-checked against the server on every sign-in and
 * on demand (`refreshClaims()`), so a grant or revocation applies without waiting an hour for the
 * ID token to roll over. On the server (SSR / prerender) nobody is signed in.
 */
@Service()
export class AuthStore {
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #auth = inject(FIREBASE_AUTH);
  readonly #app = inject(FIREBASE_APP);
  readonly #config = inject(FIREBASE_PLATFORM_CONFIG);
  readonly #user = signal<User | null | undefined>(this.#browser ? undefined : null);
  readonly #claims = signal<ResolvedClaims | null>(this.#browser ? null : { uid: null, role: 'examinee' });
  readonly #redirectError = signal<string | null>(null);
  #pendingClaims: Promise<void> = Promise.resolve();

  readonly currentUser = this.#user.asReadonly();
  /** Error from completing a redirect sign-in, if one was in flight. */
  readonly redirectError = this.#redirectError.asReadonly();
  readonly ready = computed(() => this.#user() !== undefined);
  readonly uid = computed(() => this.#user()?.uid ?? null);
  /** Signed in with a real account (not an anonymous candidate identity). */
  readonly hasAccount = computed(() => {
    const user = this.#user();
    return !!user && !user.isAnonymous;
  });
  /** The role has been resolved for the current user. */
  readonly roleReady = computed(() => {
    const user = this.#user();
    return user !== undefined && this.#claims()?.uid === (user?.uid ?? null);
  });
  readonly userRole = computed<UserRole>(() => (this.roleReady() ? (this.#claims()?.role ?? 'examinee') : 'examinee'));
  readonly isExaminer = computed(() => hasRole(this.userRole(), 'examiner'));
  readonly isSuperAdmin = computed(() => this.userRole() === 'super_admin');
  /** Verified, lower-cased email — what rosters, invitations and the directory match against. */
  readonly verifiedEmail = computed(() => {
    const user = this.#user();
    return user?.email && user.emailVerified ? normalizeEmail(user.email) : null;
  });
  readonly displayName = computed(() => this.#user()?.displayName ?? this.#user()?.email ?? null);

  /** True only when talking to the local Auth emulator. */
  readonly emulatorSignInAvailable = this.#config.emulators !== null;

  constructor() {
    if (!this.#browser) return;
    // Root singleton: the listener lives for the lifetime of the app.
    onAuthStateChanged(this.#auth, (user) => {
      this.#user.set(user);
      this.#pendingClaims = this.#resolveClaims(user, false);
    });
    // Completes a redirect sign-in (no-op otherwise) and surfaces its failure.
    getRedirectResult(this.#auth).catch(() =>
      this.#redirectError.set('تعذَّر إتمام تسجيل الدخول. أعد المحاولة.'),
    );
  }

  whenReady(): Promise<void> {
    return this.#browser ? this.#auth.authStateReady() : Promise.resolve();
  }

  /** Resolves once the current user's role is known (for guards and post-sign-in routing). */
  async whenRoleReady(): Promise<void> {
    await this.whenReady();
    await this.#pendingClaims;
  }

  /**
   * Asks the server to re-evaluate this account's role, then force-refreshes the ID token so
   * Firestore rules see the new claim immediately. If the account's tokens were revoked, the
   * refresh fails and the user is signed out — they sign in again with their current role.
   */
  refreshClaims(): Promise<void> {
    const user = this.#auth.currentUser;
    this.#pendingClaims = this.#resolveClaims(user, true);
    return this.#pendingClaims;
  }

  /**
   * Popup resolves in place. Redirect navigates away and the user comes back already signed in;
   * `onAuthStateChanged` picks it up, so callers should react to signals rather than await.
   */
  async signIn(): Promise<void> {
    const provider = new GoogleAuthProvider();
    if (this.#config.examinerSignInFlow === 'redirect') {
      await signInWithRedirect(this.#auth, provider);
    } else {
      await signInWithPopup(this.#auth, provider);
    }
  }

  /**
   * Local development only: the Auth emulator accepts unsigned Google ID tokens, which lets you
   * act as any number of distinct examiners or students without real accounts. Refuses to run
   * unless the platform is configured for emulators, so it can never work against production.
   */
  async signInOnEmulator(email: string, name?: string): Promise<void> {
    if (!this.emulatorSignInAvailable) throw new Error('الدخول عبر المحاكي معطَّل في هذه البيئة.');
    const fakeIdToken = JSON.stringify({ sub: email, email, email_verified: true, name: name || email });
    await signInWithCredential(this.#auth, GoogleAuthProvider.credential(fakeIdToken));
  }

  /** Candidates need an identity for rules, but not an account: reuse any user, else anonymous. */
  async ensureCandidate(): Promise<User> {
    await this.whenReady();
    return this.#auth.currentUser ?? (await signInAnonymously(this.#auth)).user;
  }

  signOut(): Promise<void> {
    return signOut(this.#auth);
  }

  async #resolveClaims(user: User | null, force: boolean): Promise<void> {
    if (!user || user.isAnonymous) {
      this.#claims.set({ uid: user?.uid ?? null, role: 'examinee' });
      return;
    }
    let role: UserRole;
    try {
      role = (await this.#callRefreshRole()).role;
      const token = await user.getIdTokenResult();
      // The claim changed on the server (or the caller insists): refresh so the rules see it.
      if (force || parseRole(token.claims[ROLE_CLAIM]) !== role) await user.getIdToken(true);
    } catch (error) {
      if (isRevoked(error)) {
        await signOut(this.#auth);
        return;
      }
      // Offline or function unavailable: fall back to the claim already in the token.
      role = parseRole((await user.getIdTokenResult()).claims[ROLE_CLAIM]);
    }
    if (this.#auth.currentUser?.uid === user.uid) this.#claims.set({ uid: user.uid, role });
  }

  /**
   * The Functions SDK is loaded on demand: signed-out visitors of the public portal never download
   * it, and signed-in users fetch it once, right after sign-in.
   */
  async #callRefreshRole(): Promise<RefreshRoleResponse> {
    const [{ httpsCallable }, { createFunctions }] = await Promise.all([
      import('firebase/functions'),
      import('./functions.token'),
    ]);
    const functions = createFunctions(this.#app.app, this.#app.fresh, this.#config);
    return (await httpsCallable<void, RefreshRoleResponse>(functions, 'refreshRole')()).data;
  }
}

function isRevoked(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'auth/user-token-expired' || code === 'auth/user-disabled';
}
