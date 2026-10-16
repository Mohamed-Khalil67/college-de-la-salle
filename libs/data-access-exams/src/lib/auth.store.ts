import { Service, computed, inject, signal } from '@angular/core';
import { normalizeEmail, type RefreshRoleResponse } from '@exam/contracts';
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
import { httpsCallable } from 'firebase/functions';
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS, FIREBASE_PLATFORM_CONFIG } from './firebase.providers';

interface ResolvedRole {
  readonly uid: string | null;
  readonly examiner: boolean;
}

/**
 * Auth state and role as signals. `undefined` user = still resolving the persisted session.
 *
 * Roles: examiners are an admin-managed allow-list (`config/examiners`), proven by the `examiner`
 * custom claim that only the `refreshRole` function sets. Everyone else who signs in is a
 * candidate. The role is re-checked on every sign-in so allow-list changes apply immediately.
 */
@Service()
export class AuthStore {
  readonly #auth = inject(FIREBASE_AUTH);
  readonly #functions = inject(FIREBASE_FUNCTIONS);
  readonly #config = inject(FIREBASE_PLATFORM_CONFIG);
  readonly #user = signal<User | null | undefined>(undefined);
  readonly #role = signal<ResolvedRole | null>(null);
  readonly #redirectError = signal<string | null>(null);
  #pendingRole: Promise<void> = Promise.resolve();

  readonly user = this.#user.asReadonly();
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
    return user !== undefined && this.#role()?.uid === (user?.uid ?? null);
  });
  readonly isExaminer = computed(() => this.roleReady() && this.#role()?.examiner === true);
  /** Verified, lower-cased email — what rosters and invitations match against. */
  readonly verifiedEmail = computed(() => {
    const user = this.#user();
    return user?.email && user.emailVerified ? normalizeEmail(user.email) : null;
  });
  readonly displayName = computed(() => this.#user()?.displayName ?? this.#user()?.email ?? null);

  /** True only when talking to the local Auth emulator. */
  readonly emulatorSignInAvailable = this.#config.emulators !== null;

  constructor() {
    // Root singleton: the listener lives for the lifetime of the app.
    onAuthStateChanged(this.#auth, (user) => {
      this.#user.set(user);
      this.#pendingRole = this.#resolveRole(user);
    });
    // Completes a redirect sign-in (no-op otherwise) and surfaces its failure.
    getRedirectResult(this.#auth).catch(() =>
      this.#redirectError.set('تعذَّر إتمام تسجيل الدخول. أعد المحاولة.'),
    );
  }

  whenReady(): Promise<void> {
    return this.#auth.authStateReady();
  }

  /** Resolves once the current user's role is known (for guards and post-sign-in routing). */
  async whenRoleReady(): Promise<void> {
    await this.whenReady();
    await this.#pendingRole;
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

  async #resolveRole(user: User | null): Promise<void> {
    if (!user || user.isAnonymous) {
      this.#role.set({ uid: user?.uid ?? null, examiner: false });
      return;
    }
    let examiner = false;
    try {
      const call = httpsCallable<void, RefreshRoleResponse>(this.#functions, 'refreshRole');
      examiner = (await call()).data.examiner;
      const token = await user.getIdTokenResult();
      // The claim changed on the server: refresh the token so Firestore rules see it.
      if ((token.claims['examiner'] === true) !== examiner) await user.getIdToken(true);
    } catch {
      // Offline or function unavailable: fall back to the claim already in the token.
      examiner = (await user.getIdTokenResult()).claims['examiner'] === true;
    }
    if (this.#auth.currentUser?.uid === user.uid) this.#role.set({ uid: user.uid, examiner });
  }
}
