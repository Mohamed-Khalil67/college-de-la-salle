import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, computed, inject, isDevMode, signal } from '@angular/core';
import type { Auth, User } from 'firebase/auth';
import type { DocumentData, Firestore, Unsubscribe } from 'firebase/firestore';
import { isEventKind, type Attachment, type CalendarEvent, type EventKind } from './calendar.model';
import { gradeId, type Grade, type Post, type SectionId, type StudentProfile, type StudentSummary, type Target } from './space.model';

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
  readonly title: string;
  readonly body: string;
  readonly subject: string;
  readonly target: Target;
}

export interface NewEvent {
  readonly kind: EventKind;
  readonly title: string;
  readonly subject: string;
  readonly target: Target;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly repeatUntil: string;
  readonly place: string;
  readonly description: string;
  readonly attachments: readonly Attachment[];
  readonly coefficient: number;
}

/** One row of the grade grid: a student's mark for an exam (empty score = no mark). */
export interface GradeRow {
  readonly studentUid: string;
  readonly studentName: string;
  readonly score: number | null;
  readonly comment: string;
}

interface Sdk {
  readonly auth: Auth;
  readonly db: Firestore;
  readonly authFns: typeof import('firebase/auth');
  readonly fsFns: typeof import('firebase/firestore');
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const millis = (v: unknown): number => (typeof v === 'object' && v !== null && 'toMillis' in v ? (v as { toMillis(): number }).toMillis() : 0);

function toProfile(data: DocumentData): StudentProfile | null {
  const { displayName, section, classe, done } = data;
  if (typeof displayName !== 'string' || (section !== 'nationale' && section !== 'bac') || typeof classe !== 'string') return null;
  return { displayName, section, classe, done: Array.isArray(done) ? done.filter((d): d is string => typeof d === 'string') : [] };
}

function toPost(id: string, d: DocumentData): Post {
  return {
    id,
    title: str(d['title']),
    body: str(d['body']),
    subject: str(d['subject']),
    target: str(d['target']) || 'all',
    authorUid: str(d['authorUid']),
    authorName: str(d['authorName']),
    createdAt: millis(d['createdAt']),
  };
}

function toEvent(id: string, d: DocumentData): CalendarEvent {
  const attachments = Array.isArray(d['attachments'])
    ? d['attachments'].flatMap((a: unknown) => {
        const o = (typeof a === 'object' && a !== null ? a : {}) as Record<string, unknown>;
        return typeof o['url'] === 'string' ? [{ label: str(o['label']), url: o['url'] }] : [];
      })
    : [];
  return {
    id,
    kind: isEventKind(d['kind']) ? d['kind'] : 'cours',
    title: str(d['title']),
    subject: str(d['subject']),
    target: str(d['target']) || 'all',
    date: str(d['date']),
    start: str(d['start']),
    end: str(d['end']),
    repeatUntil: str(d['repeatUntil']),
    place: str(d['place']),
    description: str(d['description']),
    attachments,
    coefficient: num(d['coefficient'], 1),
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
    eventId: str(d['eventId']),
    subject: str(d['subject']),
    title: str(d['title']),
    score: num(d['score'], 0),
    outOf: num(d['outOf'], 20),
    coefficient: num(d['coefficient'], 1),
    comment: str(d['comment']),
    published: d['published'] === true,
    teacherUid: str(d['teacherUid']),
    teacherName: str(d['teacherName']),
    createdAt: millis(d['createdAt']),
  };
}

/**
 * The school space as signals: sign-in (e-mail + password), the role of the signed-in person, and the
 * live data they may see — the calendar, announcements and their published grades for a student; the
 * calendar, announcements, the students list and the grades they gave for a teacher.
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
  readonly #events = signal<readonly CalendarEvent[]>([]);
  readonly #grades = signal<readonly Grade[]>([]);
  readonly #students = signal<readonly StudentSummary[]>([]);

  /** The sign-in state is known (a signed-out visitor is « ready » too). */
  readonly ready = this.#ready.asReadonly();
  readonly unavailable = this.#unavailable.asReadonly();
  readonly user = this.#user.asReadonly();
  readonly role = this.#role.asReadonly();
  readonly profile = this.#profile.asReadonly();
  /** Announcements, newest first. A student's page keeps only those for their class. */
  readonly posts = this.#posts.asReadonly();
  /** The shared calendar. A student's page keeps only what concerns their class. */
  readonly events = this.#events.asReadonly();
  /** A student: their published grades. A teacher: the grades they gave. */
  readonly grades = this.#grades.asReadonly();
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
    this.#events.set([]);
    this.#grades.set([]);
    this.#students.set([]);
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

  /** Announcements and the calendar: the same for students and teachers. */
  #listenShared(sdk: Sdk): Unsubscribe[] {
    const { onSnapshot, collection, query, orderBy, limit } = sdk.fsFns;
    return [
      onSnapshot(query(collection(sdk.db, 'posts'), orderBy('createdAt', 'desc'), limit(100)), (s) =>
        this.#posts.set(s.docs.map((d) => toPost(d.id, d.data({ serverTimestamps: 'estimate' })))),
      ),
      onSnapshot(query(collection(sdk.db, 'events'), orderBy('date'), limit(1000)), (s) =>
        this.#events.set(s.docs.map((d) => toEvent(d.id, d.data({ serverTimestamps: 'estimate' })))),
      ),
    ];
  }

  #listenStudent(sdk: Sdk, uid: string, generation: number): void {
    const { doc, onSnapshot, collection, query, where } = sdk.fsFns;
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
              ...this.#listenShared(sdk),
              // Only published grades: the rules refuse a query that could return a draft.
              onSnapshot(query(collection(sdk.db, 'grades'), where('studentUid', '==', uid), where('published', '==', true)), (s) =>
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
    const { onSnapshot, collection, query, where } = sdk.fsFns;
    this.#listeners.push(
      ...this.#listenShared(sdk),
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

  isDone(eventId: string): boolean {
    return this.#profile()?.done.includes(eventId) ?? false;
  }

  async toggleDone(eventId: string): Promise<void> {
    const sdk = await this.#need();
    const { arrayRemove, arrayUnion } = sdk.fsFns;
    await this.#patch({ done: this.isDone(eventId) ? arrayRemove(eventId) : arrayUnion(eventId) });
  }

  async #patch(fields: Record<string, unknown>): Promise<void> {
    const sdk = await this.#need();
    const uid = sdk.auth.currentUser?.uid;
    if (!uid) throw new Error('NOT_SIGNED_IN');
    const { doc, updateDoc, serverTimestamp } = sdk.fsFns;
    await updateDoc(doc(sdk.db, 'students', uid), { ...fields, updatedAt: serverTimestamp() });
  }

  /* ---------------------------------------------------------------- teacher: announcements */

  async publishPost(post: NewPost): Promise<void> {
    const sdk = await this.#need();
    const user = this.#currentUser(sdk);
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

  /* ---------------------------------------------------------------- teacher: calendar */

  /** Creates an event, or replaces the content of an existing one (its author and creation time stay). */
  async saveEvent(event: NewEvent, id?: string): Promise<void> {
    const sdk = await this.#need();
    const user = this.#currentUser(sdk);
    const { addDoc, collection, doc, updateDoc, serverTimestamp } = sdk.fsFns;
    const content = {
      ...event,
      title: event.title.trim(),
      place: event.place.trim(),
      description: event.description.trim(),
      attachments: event.attachments.map((a) => ({ label: a.label.trim(), url: a.url.trim() })),
    };
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

  /* ---------------------------------------------------------------- teacher: grades */

  /**
   * Saves the grade grid of an exam in one batch: a mark creates or corrects that student's grade, an
   * emptied mark removes it. `published` decides whether students see them.
   */
  async saveGrades(event: CalendarEvent, outOf: number, rows: readonly GradeRow[], published: boolean): Promise<void> {
    const sdk = await this.#need();
    const user = this.#currentUser(sdk);
    const { doc, writeBatch, serverTimestamp } = sdk.fsFns;
    const existing = new Map(this.#grades().filter((g) => g.eventId === event.id).map((g) => [g.studentUid, g]));
    const batch = writeBatch(sdk.db);
    for (const row of rows) {
      const ref = doc(sdk.db, 'grades', gradeId(event.id, row.studentUid));
      const before = existing.get(row.studentUid);
      if (row.score === null) {
        if (before) batch.delete(ref);
        continue;
      }
      const content = {
        studentName: row.studentName,
        subject: event.subject,
        title: event.title,
        score: row.score,
        outOf,
        coefficient: event.coefficient,
        comment: row.comment.trim(),
        published,
        teacherName: user.displayName || user.email || 'Enseignant',
        updatedAt: serverTimestamp(),
      };
      // A correction updates the mark and keeps who, which exam and when it was first given.
      if (before) batch.update(ref, content);
      else batch.set(ref, { ...content, studentUid: row.studentUid, eventId: event.id, teacherUid: user.uid, createdAt: serverTimestamp() });
    }
    await batch.commit();
  }

  #currentUser(sdk: Sdk): User {
    const user = sdk.auth.currentUser;
    if (!user) throw new Error('NOT_SIGNED_IN');
    return user;
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
