import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, computed, inject, isDevMode, signal } from '@angular/core';
import type { Auth } from 'firebase/auth';
import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { MAX_FAVOURITES, type SectionId, type StudentProfile } from './student.model';

/**
 * Production Firebase web config (public identifiers, not secrets — access is enforced by
 * firestore.rules). Replace the REPLACE_ME values with your project's config from the Firebase
 * console. While they are unset, the student space shows « bientôt disponible » in production.
 */
const PRODUCTION_CONFIG = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

/** Local development talks to the Firebase emulators (`npm run emulators`), never to production. */
const DEV_CONFIG = { apiKey: 'demo-key', authDomain: 'demo-lasalle.firebaseapp.com', projectId: 'demo-lasalle', appId: 'demo-app' };

export interface StudentUser {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

export type ProfileState = 'loading' | 'ready' | 'missing';

export interface NewProfile {
  readonly displayName: string;
  readonly section: SectionId;
  readonly classe: string;
}

interface Sdk {
  readonly auth: Auth;
  readonly db: Firestore;
  readonly authFns: typeof import('firebase/auth');
  readonly fsFns: typeof import('firebase/firestore');
}

function toProfile(data: Record<string, unknown>): StudentProfile | null {
  const { displayName, section, classe, progress, favourites } = data;
  if (typeof displayName !== 'string' || (section !== 'nationale' && section !== 'bac') || typeof classe !== 'string') return null;
  const cleanProgress: Record<string, string[]> = {};
  if (typeof progress === 'object' && progress !== null) {
    for (const [slug, ids] of Object.entries(progress)) {
      if (Array.isArray(ids)) cleanProgress[slug] = ids.filter((id): id is string => typeof id === 'string');
    }
  }
  return {
    displayName,
    section,
    classe,
    progress: cleanProgress,
    favourites: Array.isArray(favourites) ? favourites.filter((f): f is string => typeof f === 'string') : [],
  };
}

/**
 * Student accounts as signals: sign-up and sign-in (email + password), the student's profile, and
 * the two things they can save — chapters revised and favourite items.
 *
 * Firebase is loaded lazily and only in the browser (after the first render), so the prerendered
 * pages and the initial bundle never contain it. Writes show instantly (Firestore's local cache
 * updates the profile signal before the server confirms).
 */
@Service()
export class StudentService {
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  #sdk: Promise<Sdk> | null = null;
  #unsubscribeProfile: Unsubscribe | null = null;

  /** False in production until the Firebase config above is filled in. */
  readonly enabled = isDevMode() || PRODUCTION_CONFIG.apiKey !== 'REPLACE_ME';

  readonly #ready = signal(false);
  readonly #unavailable = signal(false);
  readonly #user = signal<StudentUser | null>(null);
  readonly #profile = signal<StudentProfile | null>(null);
  readonly #profileState = signal<ProfileState>('loading');

  /** The sign-in state is known (a signed-out visitor is « ready » too). */
  readonly ready = this.#ready.asReadonly();
  readonly unavailable = this.#unavailable.asReadonly();
  readonly user = this.#user.asReadonly();
  readonly profile = this.#profile.asReadonly();
  readonly profileState = this.#profileState.asReadonly();
  readonly signedIn = computed(() => this.#user() !== null);
  readonly firstName = computed(() => this.#profile()?.displayName.split(' ')[0] ?? null);

  /** Starts listening to the sign-in state. Browser only, idempotent. */
  async init(): Promise<void> {
    if (!this.#browser || this.#sdk || !this.enabled) return;
    try {
      const sdk = await this.#load();
      // The service lives as long as the page: the listener is never detached.
      sdk.authFns.onAuthStateChanged(sdk.auth, (user) => {
        this.#unsubscribeProfile?.();
        this.#unsubscribeProfile = null;
        if (!user) {
          this.#user.set(null);
          this.#profile.set(null);
          this.#profileState.set('loading');
          this.#ready.set(true);
          return;
        }
        this.#user.set({ uid: user.uid, email: user.email ?? '', emailVerified: user.emailVerified });
        this.#profileState.set('loading');
        this.#unsubscribeProfile = sdk.fsFns.onSnapshot(
          sdk.fsFns.doc(sdk.db, 'students', user.uid),
          (snap) => {
            const profile = snap.exists() ? toProfile(snap.data()) : null;
            this.#profile.set(profile);
            this.#profileState.set(profile ? 'ready' : 'missing');
            this.#ready.set(true);
          },
          () => {
            this.#profileState.set('missing');
            this.#ready.set(true);
          },
        );
      });
    } catch {
      this.#unavailable.set(true);
      this.#ready.set(true);
    }
  }

  async register(email: string, password: string, profile: NewProfile): Promise<void> {
    const sdk = await this.#need();
    const { user } = await sdk.authFns.createUserWithEmailAndPassword(sdk.auth, email.trim(), password);
    await this.saveProfile(profile);
    // Best effort: a verification mail helps the student recover the account later.
    await sdk.authFns.sendEmailVerification(user).catch(() => undefined);
  }

  async login(email: string, password: string): Promise<void> {
    const sdk = await this.#need();
    await sdk.authFns.signInWithEmailAndPassword(sdk.auth, email.trim(), password);
  }

  async logout(): Promise<void> {
    const sdk = await this.#need();
    await sdk.authFns.signOut(sdk.auth);
  }

  async resetPassword(email: string): Promise<void> {
    const sdk = await this.#need();
    await sdk.authFns.sendPasswordResetEmail(sdk.auth, email.trim());
  }

  /** Creates (or completes) the signed-in student's profile document. */
  async saveProfile(profile: NewProfile): Promise<void> {
    const sdk = await this.#need();
    const uid = sdk.auth.currentUser?.uid;
    if (!uid) throw new Error('NOT_SIGNED_IN');
    const { doc, setDoc, serverTimestamp } = sdk.fsFns;
    await setDoc(doc(sdk.db, 'students', uid), {
      displayName: profile.displayName.trim(),
      section: profile.section,
      classe: profile.classe,
      progress: {},
      favourites: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /** Changes name, section or class (keeps progress and favourites). */
  async updateProfile(profile: NewProfile): Promise<void> {
    await this.#patch({ displayName: profile.displayName.trim(), section: profile.section, classe: profile.classe });
  }

  isChapterRevised(slug: string, chapterId: string): boolean {
    return this.#profile()?.progress[slug]?.includes(chapterId) ?? false;
  }

  async toggleChapter(slug: string, chapterId: string): Promise<void> {
    const sdk = await this.#need();
    const { arrayRemove, arrayUnion } = sdk.fsFns;
    const revised = this.isChapterRevised(slug, chapterId);
    await this.#patch({ [`progress.${slug}`]: revised ? arrayRemove(chapterId) : arrayUnion(chapterId) });
  }

  isFavourite(id: string): boolean {
    return this.#profile()?.favourites.includes(id) ?? false;
  }

  async toggleFavourite(id: string): Promise<void> {
    const sdk = await this.#need();
    const { arrayRemove, arrayUnion } = sdk.fsFns;
    const saved = this.isFavourite(id);
    if (!saved && (this.#profile()?.favourites.length ?? 0) >= MAX_FAVOURITES) throw new Error('TOO_MANY_FAVOURITES');
    await this.#patch({ favourites: saved ? arrayRemove(id) : arrayUnion(id) });
  }

  async #patch(fields: Record<string, unknown>): Promise<void> {
    const sdk = await this.#need();
    const uid = sdk.auth.currentUser?.uid;
    if (!uid) throw new Error('NOT_SIGNED_IN');
    const { doc, updateDoc, serverTimestamp } = sdk.fsFns;
    await updateDoc(doc(sdk.db, 'students', uid), { ...fields, updatedAt: serverTimestamp() });
  }

  #need(): Promise<Sdk> {
    if (!this.enabled || !this.#browser) return Promise.reject(new Error('UNAVAILABLE'));
    return this.#load();
  }

  #load(): Promise<Sdk> {
    this.#sdk ??= (async () => {
      const [{ initializeApp, getApps }, authFns, fsFns] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const fresh = getApps().length === 0;
      const app = getApps()[0] ?? initializeApp(isDevMode() ? DEV_CONFIG : PRODUCTION_CONFIG);
      const auth = authFns.getAuth(app);
      const db = fsFns.getFirestore(app);
      if (isDevMode() && fresh) {
        authFns.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        fsFns.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      }
      return { auth, db, authFns, fsFns };
    })();
    return this.#sdk;
  }
}
