/**
 * Security rules for the school space. Runs against the Firestore emulator:
 *
 *   npm run test:rules
 *
 * Proves: a student reaches only their own data; only a VERIFIED, ALLOW-LISTED teacher can publish and
 * grade; nobody can edit the allow-list from a client; a grade is readable only by its student and the
 * teacher who gave it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const SARA = 'student-sara';
const OMAR = 'student-omar';
const MARC = 'teacher-marc';
const LEA = 'teacher-lea';
const MARC_EMAIL = 'marc@lasalle.test';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lasalle-rules',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'teachers', MARC_EMAIL), { name: 'Marc' });
    await setDoc(doc(db, 'teachers', 'lea@lasalle.test'), { name: 'Léa' });
  });
});

const as = (uid: string, claims: Record<string, unknown>): Firestore =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' }, ...claims }).firestore() as unknown as Firestore;

const student = (uid: string): Firestore => as(uid, { email: `${uid}@example.org`, email_verified: false });
const teacher = (uid = MARC, mail = MARC_EMAIL): Firestore => as(uid, { email: mail, email_verified: true });
const unverifiedTeacher = (): Firestore => as(MARC, { email: MARC_EMAIL, email_verified: false });
const outsider = (): Firestore => as('someone', { email: 'someone@example.org', email_verified: true });
const anonymousUser = (): Firestore =>
  env.authenticatedContext('anon', { firebase: { sign_in_provider: 'anonymous' } }).firestore() as unknown as Firestore;
const visitor = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

const studentDoc = (overrides: Record<string, unknown> = {}) => ({
  displayName: 'Sara Ibrahim',
  section: 'bac',
  classe: 'premiere',
  done: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const postDoc = (authorUid = MARC, overrides: Record<string, unknown> = {}) => ({
  type: 'announcement',
  title: 'Sortie au musée',
  body: 'Rendez-vous à 8 h.',
  subject: '',
  target: 'all',
  dueDate: null,
  url: null,
  authorUid,
  authorName: 'Marc Dupont',
  createdAt: serverTimestamp(),
  ...overrides,
});

const gradeDoc = (studentUid = SARA, overrides: Record<string, unknown> = {}) => ({
  studentUid,
  studentName: 'Sara Ibrahim',
  subject: 'mathematiques',
  title: 'Contrôle 1',
  score: 14.5,
  outOf: 20,
  comment: 'Bon travail.',
  teacherUid: MARC,
  teacherName: 'Marc Dupont',
  createdAt: serverTimestamp(),
  ...overrides,
});

async function seed(path: [string, string], data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path[0], path[1]), data);
  });
}

const seedStudent = (uid: string, overrides: Record<string, unknown> = {}) =>
  seed(['students', uid], { ...studentDoc(), createdAt: Timestamp.fromMillis(1_000), updatedAt: Timestamp.fromMillis(1_000), ...overrides });

describe('students: own document only', () => {
  it('a student creates, reads, updates and deletes their own profile', async () => {
    const db = student(SARA);
    await assertSucceeds(setDoc(doc(db, 'students', SARA), studentDoc()));
    await assertSucceeds(getDoc(doc(db, 'students', SARA)));
    await assertSucceeds(updateDoc(doc(db, 'students', SARA), { done: arrayUnion('post-1'), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'students', SARA), { classe: 'terminale', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(db, 'students', SARA)));
  });

  it('a student cannot read, write or delete another student’s document, nor list the collection', async () => {
    await seedStudent(SARA);
    const omar = student(OMAR);
    await assertFails(getDoc(doc(omar, 'students', SARA)));
    await assertFails(updateDoc(doc(omar, 'students', SARA), { done: arrayUnion('x'), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(omar, 'students', SARA), studentDoc({ displayName: 'Pirate' })));
    await assertFails(deleteDoc(doc(omar, 'students', SARA)));
    await assertFails(getDocs(collection(omar, 'students')));
  });

  it('visitors and anonymous users have no access', async () => {
    await seedStudent(SARA);
    for (const db of [visitor(), anonymousUser()]) {
      await assertFails(getDoc(doc(db, 'students', SARA)));
      await assertFails(setDoc(doc(db, 'students', SARA), studentDoc()));
    }
  });

  it('enforces the exact shape, and server timestamps', async () => {
    const ref = doc(student(SARA), 'students', SARA);
    await assertFails(setDoc(ref, studentDoc({ section: 'primaire' })));
    await assertFails(setDoc(ref, studentDoc({ displayName: '' })));
    await assertFails(setDoc(ref, studentDoc({ displayName: 'x'.repeat(81) })));
    await assertFails(setDoc(ref, studentDoc({ role: 'teacher' })));
    await assertFails(setDoc(ref, studentDoc({ done: 'none' })));
    await assertFails(setDoc(ref, studentDoc({ done: Array.from({ length: 301 }, (_, i) => `p${i}`) })));
    await assertFails(setDoc(ref, studentDoc({ createdAt: Timestamp.fromMillis(5) })));
    await assertFails(setDoc(ref, studentDoc({ updatedAt: Timestamp.fromMillis(5) })));
    await assertSucceeds(setDoc(ref, studentDoc()));
    await assertFails(updateDoc(ref, { admin: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
});

describe('teachers: the allow-list is read-only for clients', () => {
  it('nobody can write or list it; a person can read only their own entry', async () => {
    await assertFails(setDoc(doc(outsider(), 'teachers', 'someone@example.org'), { name: 'Me' }));
    await assertFails(setDoc(doc(teacher(), 'teachers', 'friend@example.org'), { name: 'Friend' }));
    await assertFails(deleteDoc(doc(teacher(), 'teachers', MARC_EMAIL)));
    await assertFails(getDocs(collection(teacher(), 'teachers')));
    await assertSucceeds(getDoc(doc(teacher(), 'teachers', MARC_EMAIL)));
    await assertFails(getDoc(doc(student(SARA), 'teachers', MARC_EMAIL)));
  });

  it('an e-mail in a different letter case still matches the allow-list', async () => {
    await assertSucceeds(addDoc(collection(as(MARC, { email: 'Marc@LaSalle.test', email_verified: true }), 'posts'), postDoc()));
  });
});

describe('posts', () => {
  it('a verified, listed teacher publishes an announcement, a homework and a resource', async () => {
    const db = teacher();
    await assertSucceeds(addDoc(collection(db, 'posts'), postDoc()));
    await assertSucceeds(addDoc(collection(db, 'posts'), postDoc(MARC, { type: 'assignment', dueDate: '2026-11-03', subject: 'mathematiques', target: 'bac-premiere' })));
    await assertSucceeds(addDoc(collection(db, 'posts'), postDoc(MARC, { type: 'resource', url: 'https://example.org/cours.pdf', target: 'nationale' })));
  });

  it('nobody else can publish: students, outsiders, unverified teachers, visitors', async () => {
    for (const db of [student(SARA), outsider(), unverifiedTeacher(), anonymousUser(), visitor()]) {
      await assertFails(addDoc(collection(db, 'posts'), postDoc(SARA)));
      await assertFails(addDoc(collection(db, 'posts'), postDoc(MARC)));
    }
  });

  it('rejects malformed posts', async () => {
    const posts = collection(teacher(), 'posts');
    await assertFails(addDoc(posts, postDoc(LEA)));
    await assertFails(addDoc(posts, postDoc(MARC, { type: 'poll' })));
    await assertFails(addDoc(posts, postDoc(MARC, { title: '' })));
    await assertFails(addDoc(posts, postDoc(MARC, { title: 'x'.repeat(121) })));
    await assertFails(addDoc(posts, postDoc(MARC, { body: 'x'.repeat(4001) })));
    await assertFails(addDoc(posts, postDoc(MARC, { target: 'cm2' })));
    await assertFails(addDoc(posts, postDoc(MARC, { type: 'assignment' })));
    await assertFails(addDoc(posts, postDoc(MARC, { type: 'assignment', dueDate: 'demain' })));
    await assertFails(addDoc(posts, postDoc(MARC, { dueDate: '2026-11-03' })));
    await assertFails(addDoc(posts, postDoc(MARC, { type: 'resource', url: 'javascript:alert(1)' })));
    await assertFails(addDoc(posts, postDoc(MARC, { type: 'resource', url: 'http://example.org' })));
    await assertFails(addDoc(posts, postDoc(MARC, { url: 'https://example.org' })));
    await assertFails(addDoc(posts, postDoc(MARC, { createdAt: Timestamp.fromMillis(5) })));
    await assertFails(addDoc(posts, postDoc(MARC, { extra: 1 })));
  });

  it('students and teachers read posts; visitors, outsiders and anonymous users do not', async () => {
    await seedStudent(SARA);
    await seed(['posts', 'p1'], { ...postDoc(), createdAt: Timestamp.fromMillis(1_000) });
    await assertSucceeds(getDocs(collection(student(SARA), 'posts')));
    await assertSucceeds(getDocs(collection(teacher(), 'posts')));
    await assertFails(getDocs(collection(student(OMAR), 'posts'))); // no student profile
    await assertFails(getDocs(collection(outsider(), 'posts')));
    await assertFails(getDoc(doc(anonymousUser(), 'posts', 'p1')));
    await assertFails(getDoc(doc(visitor(), 'posts', 'p1')));
  });

  it('posts are never edited; only the author deletes theirs', async () => {
    await seed(['posts', 'p1'], { ...postDoc(), createdAt: Timestamp.fromMillis(1_000) });
    await assertFails(updateDoc(doc(teacher(), 'posts', 'p1'), { title: 'Changé' }));
    await assertFails(deleteDoc(doc(teacher(LEA, 'lea@lasalle.test'), 'posts', 'p1')));
    await seedStudent(SARA);
    await assertFails(deleteDoc(doc(student(SARA), 'posts', 'p1')));
    await assertSucceeds(deleteDoc(doc(teacher(), 'posts', 'p1')));
  });
});

describe('students list (for teachers)', () => {
  it('a verified teacher can list students; an unverified teacher and students cannot', async () => {
    await seedStudent(SARA);
    await seedStudent(OMAR);
    await assertSucceeds(getDocs(collection(teacher(), 'students')));
    await assertSucceeds(getDoc(doc(teacher(), 'students', SARA)));
    await assertFails(getDocs(collection(unverifiedTeacher(), 'students')));
    await assertFails(getDocs(collection(student(SARA), 'students')));
  });

  it('a teacher cannot change a student’s profile', async () => {
    await seedStudent(SARA);
    await assertFails(updateDoc(doc(teacher(), 'students', SARA), { classe: 'terminale', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(teacher(), 'students', SARA)));
  });
});

describe('grades', () => {
  beforeEach(async () => {
    await seedStudent(SARA);
    await seedStudent(OMAR);
  });

  it('a verified, listed teacher grades an existing student', async () => {
    await assertSucceeds(addDoc(collection(teacher(), 'grades'), gradeDoc()));
    await assertSucceeds(addDoc(collection(teacher(), 'grades'), gradeDoc(SARA, { score: 0, outOf: 10, comment: '' })));
  });

  it('nobody else can grade', async () => {
    for (const db of [student(SARA), outsider(), unverifiedTeacher(), visitor()]) {
      await assertFails(addDoc(collection(db, 'grades'), gradeDoc()));
    }
  });

  it('rejects malformed grades', async () => {
    const grades = collection(teacher(), 'grades');
    await assertFails(addDoc(grades, gradeDoc('ghost')));
    await assertFails(addDoc(grades, gradeDoc(SARA, { score: 21 })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { score: -1 })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { outOf: 0 })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { outOf: 101 })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { score: '14' })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { subject: '' })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { title: '' })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { comment: 'x'.repeat(1001) })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { teacherUid: LEA })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { createdAt: Timestamp.fromMillis(5) })));
    await assertFails(addDoc(grades, gradeDoc(SARA, { extra: 1 })));
  });

  it('a student reads only their own grades', async () => {
    await seed(['grades', 'g1'], { ...gradeDoc(SARA), createdAt: Timestamp.fromMillis(1_000) });
    await seed(['grades', 'g2'], { ...gradeDoc(OMAR), createdAt: Timestamp.fromMillis(1_000) });
    await assertSucceeds(getDoc(doc(student(SARA), 'grades', 'g1')));
    await assertFails(getDoc(doc(student(SARA), 'grades', 'g2')));
    await assertSucceeds(getDocs(query(collection(student(SARA), 'grades'), where('studentUid', '==', SARA))));
    await assertFails(getDocs(collection(student(SARA), 'grades')));
    await assertFails(getDocs(query(collection(student(SARA), 'grades'), where('studentUid', '==', OMAR))));
    await assertFails(getDoc(doc(visitor(), 'grades', 'g1')));
  });

  it('a teacher reads only the grades they gave', async () => {
    await seed(['grades', 'g1'], { ...gradeDoc(SARA), createdAt: Timestamp.fromMillis(1_000) });
    await seed(['grades', 'g2'], { ...gradeDoc(SARA, { teacherUid: LEA, teacherName: 'Léa' }), createdAt: Timestamp.fromMillis(1_000) });
    await assertSucceeds(getDocs(query(collection(teacher(), 'grades'), where('teacherUid', '==', MARC))));
    await assertSucceeds(getDoc(doc(teacher(), 'grades', 'g1')));
    await assertFails(getDoc(doc(teacher(), 'grades', 'g2')));
    await assertFails(getDocs(collection(teacher(), 'grades')));
  });

  it('grades are never edited; only the teacher who gave one deletes it', async () => {
    await seed(['grades', 'g1'], { ...gradeDoc(SARA), createdAt: Timestamp.fromMillis(1_000) });
    await assertFails(updateDoc(doc(teacher(), 'grades', 'g1'), { score: 20 }));
    await assertFails(updateDoc(doc(student(SARA), 'grades', 'g1'), { score: 20 }));
    await assertFails(deleteDoc(doc(student(SARA), 'grades', 'g1')));
    await assertFails(deleteDoc(doc(teacher(LEA, 'lea@lasalle.test'), 'grades', 'g1')));
    await assertSucceeds(deleteDoc(doc(teacher(), 'grades', 'g1')));
  });
});

describe('everything else', () => {
  it('is closed', async () => {
    await assertFails(getDoc(doc(student(SARA), 'content_pages', 'home')));
    await assertFails(setDoc(doc(teacher(), 'anything', 'x'), { a: 1 }));
  });
});
