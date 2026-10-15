import { Service, computed, inject, signal } from '@angular/core';
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
import { FIREBASE_AUTH, FIREBASE_PLATFORM_CONFIG } from './firebase.providers';

/** Auth state as signals. `undefined` = still resolving the persisted session. */
@Service()
export class AuthStore {
  readonly #auth = inject(FIREBASE_AUTH);
  readonly #config = inject(FIREBASE_PLATFORM_CONFIG);
  readonly #user = signal<User | null | undefined>(undefined);

  readonly #redirectError = signal<string | null>(null);

  readonly user = this.#user.asReadonly();
  /** Error from completing a redirect sign-in, if one was in flight. */
  readonly redirectError = this.#redirectError.asReadonly();
  readonly ready = computed(() => this.#user() !== undefined);
  readonly uid = computed(() => this.#user()?.uid ?? null);
  /** Examiners hold a real identity; anonymous users can only ever be candidates. */
  readonly isExaminer = computed(() => {
    const user = this.#user();
    return !!user && !user.isAnonymous;
  });
  readonly displayName = computed(() => this.#user()?.displayName ?? this.#user()?.email ?? null);

  constructor() {
    // Root singleton: the listener lives for the lifetime of the app.
    onAuthStateChanged(this.#auth, (user) => this.#user.set(user));
    // Completes a redirect sign-in (no-op otherwise) and surfaces its failure.
    getRedirectResult(this.#auth).catch((error: unknown) =>
      this.#redirectError.set(error instanceof Error ? error.message : 'Sign-in failed.'),
    );
  }

  whenReady(): Promise<void> {
    return this.#auth.authStateReady();
  }

  /**
   * Popup resolves in place. Redirect navigates away and the user comes back already signed in;
   * `onAuthStateChanged` picks it up, so callers should react to `isExaminer()` rather than await.
   */
  async signInExaminer(): Promise<void> {
    const provider = new GoogleAuthProvider();
    if (this.#config.examinerSignInFlow === 'redirect') {
      await signInWithRedirect(this.#auth, provider);
    } else {
      await signInWithPopup(this.#auth, provider);
    }
  }

  /** True only when talking to the local Auth emulator. */
  readonly emulatorSignInAvailable = this.#config.emulators !== null;

  /**
   * Local development only: the Auth emulator accepts unsigned Google ID tokens, which lets you
   * act as any number of distinct examiners without a real Google account. Refuses to run unless
   * the platform is configured for emulators, so it can never work against production.
   */
  async signInExaminerOnEmulator(email: string): Promise<void> {
    if (!this.emulatorSignInAvailable) throw new Error('Emulator sign-in is disabled.');
    const fakeIdToken = JSON.stringify({ sub: email, email, email_verified: true, name: email });
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
}
