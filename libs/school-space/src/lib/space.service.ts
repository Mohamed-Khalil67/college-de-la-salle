import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, computed, inject, isDevMode, signal } from '@angular/core';
import type { Auth, User } from 'firebase/auth';
import type { DocumentData, Firestore, Unsubscribe } from 'firebase/firestore';
import type { CalendarEvent, EventKind } from './calendar.model';
import type { Grade, Post, PostType, SectionId, StudentProfile, StudentSummary, Target } from './space.model';

/**
 * Production Firebase web config (public identifiers, not secrets — access is enforced by
 * firestore.rules). The values below are the school project's config (from the Firebase
 * console). If they are ever reset to REPLACE_ME, the school space shows « bientôt disponible » in production.
 */
const PRODUCTION_CONFIG = {
  apiKey: 'AIzaSyC_2ryGYJo5zu601ihfexEOv6zoqiH-vfc',
  authDomain: 'college-de-la-salle-daher.firebaseapp.com',
  projectId: 'college-de-la-salle-daher',
  appId: '1:597106182117:web:53114269345d85b1fc510c',
};

/** Local development talks to the Firebase emulators (`npm run emulators`), never to production. */
const DEV_CONFIG = { apiKey: 'demo-key', authDomain: 'demo-lasalle.firebaseapp.com', projectId: 'demo-lasalle', appId: 'demo-app' };

export interface SpaceUser {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayName: string;
}

/**
 * What the signed-in person is:
 *  - `loading`: still finding out;
 *  - `student`: has a student profile;
 *  - `teacher`: verified e-mail listed in `teachers/{email}`;
 *  - `teacher-unverified`: listed, but the e-mail is not verified yet (cannot publish);
 *  - `none`: signed in, but neither (a student who never saved a profile, or an unlisted account).
 */
export type Role = 'loading' | 'student' | 'teacher' | 'teacher-unverified' | 'none';

export interface NewProfile {
  readonly displayName: string;
  readonly section: SectionId;
  readonly classe: string;
}

export interface NewPost {
  readonly type: PostType;
  readonly title: string;
  readonly body: string;
  readonly subject: string;
  readonly target: Target;
  readonly dueDate: string | null;
  readonly url: string | null;
}

export interface NewEvent {
  readonly kind: EventKind;
  readonly title: string;
  readonly date: string;
  readonly time: string;
  readonly target: Target;
  readonly subject: string;
  readonly note: string;
}

export interface NewGrade {
  readonly studentUid: string;
  readonly studentName: string;
  readonly subject: string;
  readonly title: string;
  readonly score: number;
  readonly outOf: number;
  readonly comment: string;
}

interface Sdk {
  readonly auth: Auth;
  readonly db: Firestore;
  readonly authFns: typeof import('firebase/auth');
  readonly fsFns: typeof import('firebase/firestore');
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const millis = (v: unknown): number => (typeof v === 'object' && v !== null && 'toMillis' in v ? (v as { toMillis(): number }).toMillis() : 0);

function toProfile(data: DocumentData): StudentProfile | null {
  const { displayName, section, classe, done } = data;
  if (typeof displayName !== 'string' || (section !== 'nationale' && section !== 'bac') || typeof classe !== 'string') return null;
  return { displayName, section, classe, done: Array.isArray(done) ? done.filter((d): d is string => typeof d === 'string') : [] };
}

function toPost(id: string, d: DocumentData): Post {
  return {
    id,
    type: d['type'] === 'assignment' || d['type'] === 'resource' ? d['type'] : 'announcement',
    title: str(d['title']),
    body: str(d['body']),
    subject: str(d['subject']),
    target: str(d['target']) || 'all',
    dueDate: typeof d['dueDate'] === 'string' ? d['dueDate'] : null,
    url: typeof d['url'] === 'string' ? d['url'] : null,
    authorUid: str(d['authorUid']),
    authorName: str(d['authorName']),
    createdAt: millis(d['createdAt']),
  };
}

function toEvent(id: string, d: DocumentData): CalendarEvent {
  return {
    id,
    kind: d['kind'] === 'exam' || d['kind'] === 'meeting' ? d['kind'] : 'activity',
    title: str(d['title']),
    date: str(d['date']),
    time: str(d['time']),
    target: str(d['target']) || 'all',
    subject: str(d['subject']),
    note: str(d['note']),
    authorUid: str(d['authorUid']),
    authorName: str(d['authorName']),
    createdAt: millis(d['createdAt']),
  };
}

function toGrade(id: string, d: DocumentData): Grade {
  return {
    id,
    studentUid: str(d['studentUid']),
    studentName: str(d['studentName']),
    subject: str(d['subject']),
    title: str(d['title']),
    score: Number(d['score']) || 0,
    outOf: Number(d['outOf']) || 20,
    comment: str(d['comment']),
    teacherUid: str(d['teacherUid']),
    teacherName: str(d['teacherName']),
    createdAt: millis(d['createdAt']),
  };
}

/**
 * The school space as signals: sign-in (e-mail + password), the role of the signed-in person, and the
 * live data they may see — posts and their own grades for a student; posts, the students list and the
 * grades they gave for a teacher.
 *
 * Firebase is loaded lazily and only in the browser (after the first render), so the prerendered pages
 * and the initial bundle never contain it. Writes show instantly (Firestore's local cache updates the
 * signals before the server confirms).
 */
@Service()
export class SpaceService {
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  #sdk: Promise<Sdk> | null = null;
  #listeners: Unsubscribe[] = [];
  /** Bumped on every auth change, so a slow listener setup for a previous user is ignored. */
  #generation = 0;

  /** False in production until the Firebase config above is filled in. */
  readonly enabled = isDevMode() || PRODUCTION_CONFIG.apiKey !== 'REPLACE_ME';

  readonly #ready = signal(false);
  readonly #unavailable = signal(false);
  readonly #user = signal<SpaceUser | null>(null);
  readonly #role = signal<Role>('loading');
  readonly #profile = signal<StudentProfile | null>(null);
  readonly #posts = signal<readonly Post[]>([]);
  readonly #grades = signal<readonly Grade[]>([]);
  readonly #students = signal<readonly StudentSummary[]>([]);
  readonly #events = signal<readonly CalendarEvent[]>([]);

  /** The sign-in state is known (a signed-out visitor is « ready » too). */
  readonly ready = this.#ready.asReadonly();
  readonly unavailable = this.#unavailable.asReadonly();
  readonly user = this.#user.asReadonly();
  readonly role = this.#role.asReadonly();
  readonly profile = this.#profile.asReadonly();
  /** Newest first. For a student: every post (the page filters by audience). */
  readonly posts = this.#posts.asReadonly();
  /** A student: their grades. A teacher: the grades they gave. */
  readonly grades = this.#grades.asReadonly();
  /** The shared calendar. Students see only what concerns their class (filtered by the page). */
  readonly events = this.#events.asReadonly();
  /** Teachers only. */
  readonly students = this.#students.asReadonly();
  readonly signedIn = computed(() => this.#user() !== null);
  readonly firstName = computed(() => {
    const name = this.#profile()?.displayName ?? this.#user()?.displayName ?? '';
    return name.split(' ')[0] || null;
  });

  /** Starts listening to the sign-in state. Browser only, idempotent. */
  async init(): Promise<void> {
    if (!this.#browser || this.#sdk || !this.enabled) return;
    try {
      const sdk = await this.#load();
      // The service lives as long as the page: the listener is never detached.
      sdk.authFns.onAuthStateChanged(sdk.auth, (user) => void this.#onUser(sdk, user));
    } catch {
      this.#unavailable.set(true);
      this.#ready.set(true);
    }
  }

  async #onUser(sdk: Sdk, user: User | null): Promise<void> {
    const generation = ++this.#generation;
    this.#detach();
    this.#profile.set(null);
    this.#posts.set([]);
    this.#grades.set([]);
    this.#students.set([]);
    this.#events.set([]);
    if (!user) {
      this.#user.set(null);
      this.#role.set('loading');
      this.#ready.set(true);
      return;
    }
    this.#user.set({ uid: user.uid, email: user.email ?? '', emailVerified: user.emailVerified, displayName: user.displayName ?? '' });
    this.#role.set('loading');
    const { doc, getDoc } = sdk.fsFns;
    const email = (user.email ?? '').toLowerCase();
    let listed = false;
    try {
      listed = email !== '' && (await getDoc(doc(sdk.db, 'teachers', email))).exists();
    } catch {
      listed = false;
    }
    if (generation !== this.#generation) return;
    if (listed) {
      this.#role.set(user.emailVerified ? 'teacher' : 'teacher-unverified');
      if (user.emailVerified) this.#listenTeacher(sdk, user.uid);
      this.#ready.set(true);
      return;
    }
    this.#listenStudent(sdk, user.uid, generation);
  }

  #detach(): void {
    for (const stop of this.#listeners) stop();
    this.#listeners = [];
  }

  #listenStudent(sdk: Sdk, uid: string, generation: number): void {
    const { doc, onSnapshot, collection, query, where, orderBy, limit } = sdk.fsFns;
    let dataStarted = false;
    this.#listeners.push(
      onSnapshot(
        doc(sdk.db, 'students', uid),
        // Metadata changes too: the data listeners must wait until the profile is on the server, because the
        // security rules check that it exists (a listener rejected by the rules never recovers).
        { includeMetadataChanges: true },
        (snap) => {
          if (generation !== this.#generation) return;
          const profile = snap.exists() ? toProfile(snap.data()) : null;
          this.#profile.set(profile);
          this.#role.set(profile ? 'student' : 'none');
          this.#ready.set(true);
          if (profile && !dataStarted && !snap.metadata.hasPendingWrites) {
            dataStarted = true;
            this.#listeners.push(
              onSnapshot(query(collection(sdk.db, 'posts'), orderBy('createdAt', 'desc'), limit(200)), (s) =>
                this.#posts.set(s.docs.map((d) => toPost(d.id, d.data({ serverTimestamps: 'estimate' })))),
              ),
              onSnapshot(query(collection(sdk.db, 'events'), orderBy('date'), limit(500)), (s) =>
        this.#events.set(s.docs.map((d) => toEvent(d.id, d.data()))),
      ),
              onSnapshot(query(collection(sdk.db, 'grades'), where('studentUid', '==', uid)), (s) =>
                this.#grades.set(s.docs.map((d) => toGrade(d.id, d.data({ serverTimestamps: 'estimate' })))),
              ),
            );
          }
        },
        () => {
          this.#role.set('none');
          this.#ready.set(true);
        },
      ),
    );
  }

  #listenTeacher(sdk: Sdk, uid: string): void {
    const { onSnapshot, collection, query, where, orderBy, limit } = sdk.fsFns;
    this.#listeners.push(
      onSnapshot(query(collection(sdk.db, 'posts'), orderBy('createdAt', 'desc'), limit(200)), (s) =>
        this.#posts.set(s.docs.map((d) => toPost(d.id, d.data({ serverTimestamps: 'estimate' })))),
      ),
      onSnapshot(query(collection(sdk.db, 'events'), orderBy('date'), limit(500)), (s) =>
        this.#events.set(s.docs.map((d) => toEvent(d.id, d.data()))),
      ),
      onSnapshot(query(collection(sdk.db, 'grades'), where('teacherUid', '==', uid)), (s) =>
        this.#grades.set(s.docs.map((d) => toGrade(d.id, d.data({ serverTimestamps: 'estimate' })))),
      ),
      onSnapshot(collection(sdk.db, 'students'), (s) =>
        this.#students.set(
          s.docs.flatMap((d) => {
            const p = toProfile(d.data());
            return p ? [{ uid: d.id, displayName: p.displayName, section: p.section, classe: p.classe }] : [];
          }),
        ),
      ),
    );
  }

  /* ---------------------------------------------------------------- accounts */

  async registerStudent(email: string, password: string, profile: NewProfile): Promise<void> {
    const sdk = await this.#need();
    const { user } = await sdk.authFns.createUserWithEmailAndPassword(sdk.auth, email.trim(), password);
    await sdk.authFns.updateProfile(user, { displayName: profile.displayName.trim() }).catch(() => undefined);
    await this.saveProfile(profile);
    // Best effort: a verification mail helps the student recover the account later.
    await sdk.authFns.sendEmailVerification(user).catch(() => undefined);
  }

  /** Creates the account only; being a teacher requires the administrator to list the e-mail. */
  async registerTeacher(email: string, password: string, displayName: string): Promise<void> {
    const sdk = await this.#need();
    const { user } = await sdk.authFns.createUserWithEmailAndPassword(sdk.auth, email.trim(), password);
    await sdk.authFns.updateProfile(user, { displayName: displayName.trim() }).catch(() => undefined);
    await sdk.authFns.sendEmailVerification(user).catch(() => undefined);
    await this.refresh();
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

  async resendVerification(): Promise<void> {
    const sdk = await this.#need();
    if (sdk.auth.currentUser) await sdk.authFns.sendEmailVerification(sdk.auth.currentUser);
  }

  /** Re-reads the account (e-mail verified? name?) and recomputes the role. */
  async refresh(): Promise<void> {
    const sdk = await this.#need();
    const user = sdk.auth.currentUser;
    if (!user) return;
    await user.reload();
    await user.getIdToken(true);
    await this.#onUser(sdk, user);
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
      done: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /** Changes name, section or class (keeps the « done » homework). */
  async updateProfile(profile: NewProfile): Promise<void> {
    await this.#patch({ displayName: profile.displayName.trim(), section: profile.section, classe: profile.classe });
  }

  /* ---------------------------------------------------------------- student */

  isDone(postId: string): boolean {
    return this.#profile()?.done.includes(postId) ?? false;
  }

  async toggleDone(postId: string): Promise<void> {
    const sdk = await this.#need();
    const { arrayRemove, arrayUnion } = sdk.fsFns;
    await this.#patch({ done: this.isDone(postId) ? arrayRemove(postId) : arrayUnion(postId) });
  }

  async #patch(fields: Record<string, unknown>): Promise<void> {
    const sdk = await this.#need();
    const uid = sdk.auth.currentUser?.uid;
    if (!uid) throw new Error('NOT_SIGNED_IN');
    const { doc, updateDoc, serverTimestamp } = sdk.fsFns;
    await updateDoc(doc(sdk.db, 'students', uid), { ...fields, updatedAt: serverTimestamp() });
  }

  /* ---------------------------------------------------------------- teacher */

  async publishPost(post: NewPost): Promise<void> {
    const sdk = await this.#need();
    const user = sdk.auth.currentUser;
    if (!user) throw new Error('NOT_SIGNED_IN');
    const { addDoc, collection, serverTimestamp } = sdk.fsFns;
    await addDoc(collection(sdk.db, 'posts'), {
      ...post,
      title: post.title.trim(),
      body: post.body.trim(),
      authorUid: user.uid,
      authorName: user.displayName || user.email || 'Enseignant',
      createdAt: serverTimestamp(),
    });
  }

  async deletePost(id: string): Promise<void> {
    const sdk = await this.#need();
    await sdk.fsFns.deleteDoc(sdk.fsFns.doc(sdk.db, 'posts', id));
  }

  async saveEvent(event: NewEvent, id?: string): Promise<void> {
    const sdk = await this.#need();
    const user = sdk.auth.currentUser;
    if (!user) throw new Error('NOT_SIGNED_IN');
    const { addDoc, collection, doc, updateDoc, serverTimestamp } = sdk.fsFns;
    const content = { ...event, title: event.title.trim(), note: event.note.trim() };
    if (id) {
      await updateDoc(doc(sdk.db, 'events', id), content);
      return;
    }
    await addDoc(collection(sdk.db, 'events'), {
      ...content,
      authorUid: user.uid,
      authorName: user.displayName || user.email || 'Enseignant',
      createdAt: serverTimestamp(),
    });
  }

  async deleteEvent(id: string): Promise<void> {
    const sdk = await this.#need();
    await sdk.fsFns.deleteDoc(sdk.fsFns.doc(sdk.db, 'events', id));
  }

  async addGrade(grade: NewGrade): Promise<void> {
    const sdk = await this.#need();
    const user = sdk.auth.currentUser;
    if (!user) throw new Error('NOT_SIGNED_IN');
    const { addDoc, collection, serverTimestamp } = sdk.fsFns;
    await addDoc(collection(sdk.db, 'grades'), {
      ...grade,
      title: grade.title.trim(),
      comment: grade.comment.trim(),
      teacherUid: user.uid,
      teacherName: user.displayName || user.email || 'Enseignant',
      createdAt: serverTimestamp(),
    });
  }

  async deleteGrade(id: string): Promise<void> {
    const sdk = await this.#need();
    await sdk.fsFns.deleteDoc(sdk.fsFns.doc(sdk.db, 'grades', id));
  }

  /* ---------------------------------------------------------------- plumbing */

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
