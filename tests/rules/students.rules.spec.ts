/**
 * Security rules for the student space. Runs against the Firestore emulator:
 *
 *   npm run test:rules
 *
 * Proves that a student can read and write only their own document, only in the exact shape, and
 * that nobody can list students or read another student's progress.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const SARA = 'student-sara';
const OMAR = 'student-omar';

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
});

const student = (uid: string): Firestore =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' }, email: `${uid}@example.org` }).firestore() as unknown as Firestore;

const anonymousUser = (uid = 'anon'): Firestore =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore() as unknown as Firestore;

const visitor = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

const newDoc = (overrides: Record<string, unknown> = {}) => ({
  displayName: 'Sara Ibrahim',
  section: 'nationale',
  classe: 'secondaire-3',
  progress: {},
  favourites: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

async function seed(uid: string, overrides: Record<string, unknown> = {}): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, 'students', uid), {
      ...newDoc(),
      createdAt: Timestamp.fromMillis(1_000),
      updatedAt: Timestamp.fromMillis(1_000),
      ...overrides,
    });
  });
}

describe('students: own document only', () => {
  it('a student creates their own profile', async () => {
    await assertSucceeds(setDoc(doc(student(SARA), 'students', SARA), newDoc()));
  });

  it('a student reads and updates their own document', async () => {
    await seed(SARA);
    const db = student(SARA);
    await assertSucceeds(getDoc(doc(db, 'students', SARA)));
    await assertSucceeds(updateDoc(doc(db, 'students', SARA), { 'progress.mathematiques': arrayUnion('analyse'), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'students', SARA), { favourites: arrayUnion('mathematiques:ex:0'), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'students', SARA), { favourites: arrayRemove('mathematiques:ex:0'), updatedAt: serverTimestamp() }));
  });

  it('a student cannot read, write, or delete another student’s document', async () => {
    await seed(SARA, { progress: { mathematiques: ['analyse'] } });
    const omar = student(OMAR);
    await assertFails(getDoc(doc(omar, 'students', SARA)));
    await assertFails(updateDoc(doc(omar, 'students', SARA), { favourites: arrayUnion('x'), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(omar, 'students', SARA), newDoc({ displayName: 'Pirate' })));
    await assertFails(deleteDoc(doc(omar, 'students', SARA)));
  });

  it('nobody can list the students collection', async () => {
    await seed(SARA);
    await assertFails(getDocs(collection(student(SARA), 'students')));
    await assertFails(getDocs(collection(student(OMAR), 'students')));
  });

  it('signed-out visitors and anonymous users have no access at all', async () => {
    await seed(SARA);
    for (const db of [visitor(), anonymousUser(SARA)]) {
      await assertFails(getDoc(doc(db, 'students', SARA)));
      await assertFails(setDoc(doc(db, 'students', SARA), newDoc()));
    }
    await assertFails(setDoc(doc(anonymousUser('anon'), 'students', 'anon'), newDoc()));
  });

  it('a student can delete their own account data', async () => {
    await seed(SARA);
    await assertSucceeds(deleteDoc(doc(student(SARA), 'students', SARA)));
  });

  it('nothing else in the database is readable or writable', async () => {
    await assertFails(getDoc(doc(student(SARA), 'content_pages', 'home')));
    await assertFails(setDoc(doc(student(SARA), 'anything', 'x'), { a: 1 }));
  });
});

describe('students: strict document shape', () => {
  it('rejects an invalid section, name, class, or extra field', async () => {
    const db = student(SARA);
    const ref = doc(db, 'students', SARA);
    await assertFails(setDoc(ref, newDoc({ section: 'primaire' })));
    await assertFails(setDoc(ref, newDoc({ displayName: '' })));
    await assertFails(setDoc(ref, newDoc({ displayName: 'x'.repeat(81) })));
    await assertFails(setDoc(ref, newDoc({ classe: '' })));
    await assertFails(setDoc(ref, newDoc({ role: 'teacher' })));
    await assertFails(setDoc(ref, newDoc({ favourites: 'none' })));
    await assertFails(setDoc(ref, newDoc({ progress: [] })));
  });

  it('rejects oversized progress and favourites', async () => {
    const ref = doc(student(SARA), 'students', SARA);
    const progress = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`s${i}`, []]));
    await assertFails(setDoc(ref, newDoc({ progress })));
    await assertFails(setDoc(ref, newDoc({ favourites: Array.from({ length: 201 }, (_, i) => `f${i}`) })));
    await assertSucceeds(setDoc(ref, newDoc({ favourites: Array.from({ length: 200 }, (_, i) => `f${i}`) })));
  });

  it('timestamps are server time: createdAt cannot be forged or changed, updatedAt must be now', async () => {
    const db = student(SARA);
    await assertFails(setDoc(doc(db, 'students', SARA), newDoc({ createdAt: Timestamp.fromMillis(5) })));
    await assertFails(setDoc(doc(db, 'students', SARA), newDoc({ updatedAt: Timestamp.fromMillis(5) })));

    await seed(SARA);
    await assertFails(updateDoc(doc(db, 'students', SARA), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'students', SARA), { favourites: arrayUnion('a'), updatedAt: Timestamp.fromMillis(5) }));
  });

  it('a student cannot add fields to an existing document', async () => {
    await seed(SARA);
    await assertFails(updateDoc(doc(student(SARA), 'students', SARA), { admin: true, updatedAt: serverTimestamp() }));
  });
});
