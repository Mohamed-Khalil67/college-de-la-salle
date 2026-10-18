/**
 * Security rules for the shared calendar (`events`): any verified, listed teacher edits it; students
 * can only read; nobody else can even read.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const MARC = 'teacher-marc';
const LEA = 'teacher-lea';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lasalle-rules-events',
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
    await setDoc(doc(db, 'teachers', 'marc@lasalle.test'), { name: 'Marc' });
    await setDoc(doc(db, 'teachers', 'lea@lasalle.test'), { name: 'Léa' });
    await setDoc(doc(db, 'students', 'sara'), {
      displayName: 'Sara', section: 'bac', classe: 'premiere', done: [], createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1),
    });
    await setDoc(doc(db, 'events', 'e1'), { ...eventDoc(MARC), createdAt: Timestamp.fromMillis(1_000) });
  });
});

const as = (uid: string, claims: Record<string, unknown>): Firestore =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' }, ...claims }).firestore() as unknown as Firestore;

const marc = () => as(MARC, { email: 'marc@lasalle.test', email_verified: true });
const lea = () => as(LEA, { email: 'lea@lasalle.test', email_verified: true });
const unverified = () => as(MARC, { email: 'marc@lasalle.test', email_verified: false });
const sara = () => as('sara', { email: 'sara@example.org', email_verified: false });
const outsider = () => as('x', { email: 'x@example.org', email_verified: true });
const visitor = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const eventDoc = (authorUid = MARC, overrides: Record<string, unknown> = {}) => ({
  kind: 'examen',
  title: 'Examen de mathématiques',
  subject: 'mathematiques',
  target: 'bac-premiere',
  date: '2026-11-12',
  start: '08:30',
  end: '10:30',
  repeatUntil: '',
  place: 'Salle 12',
  description: 'Calculatrice autorisée.',
  attachments: [{ label: 'Sujet de l’an dernier', url: 'https://example.org/sujet.pdf' }],
  coefficient: 2,
  authorUid,
  authorName: 'Marc Dupont',
  createdAt: serverTimestamp(),
  ...overrides,
});

// What an update may carry: the content only (author and creation time are unchanged).
const content = (overrides: Record<string, unknown> = {}) => {
  const { authorUid, authorName, createdAt, ...rest } = eventDoc();
  void authorUid; void authorName; void createdAt;
  return { ...rest, ...overrides };
};

describe('events', () => {
  it('a verified, listed teacher adds classes, weekly timetable slots, exams, homework and meetings', async () => {
    const events = collection(marc(), 'events');
    await assertSucceeds(addDoc(events, eventDoc()));
    await assertSucceeds(addDoc(events, eventDoc(MARC, { kind: 'cours', repeatUntil: '2027-06-30', coefficient: 1, attachments: [] })));
    await assertSucceeds(addDoc(events, eventDoc(MARC, { kind: 'devoir', start: '', end: '', place: '', target: 'all', subject: '' })));
    await assertSucceeds(addDoc(events, eventDoc(MARC, { kind: 'reunion', target: 'nationale-secondaire-2', end: '' })));
  });

  it('students, outsiders, unverified teachers and visitors cannot add, edit or delete', async () => {
    for (const db of [sara(), outsider(), unverified(), visitor()]) {
      await assertFails(addDoc(collection(db, 'events'), eventDoc('sara')));
      await assertFails(addDoc(collection(db, 'events'), eventDoc(MARC)));
      await assertFails(updateDoc(doc(db, 'events', 'e1'), content()));
      await assertFails(deleteDoc(doc(db, 'events', 'e1')));
    }
  });

  it('students and teachers read; outsiders and visitors do not', async () => {
    await assertSucceeds(getDocs(collection(sara(), 'events')));
    await assertSucceeds(getDocs(collection(marc(), 'events')));
    await assertFails(getDocs(collection(outsider(), 'events')));
    await assertFails(getDocs(collection(visitor(), 'events')));
  });

  it('the calendar is shared: another teacher can correct or delete an event, but not change its author', async () => {
    await assertSucceeds(updateDoc(doc(lea(), 'events', 'e1'), content({ date: '2026-11-19', start: '10:00', end: '12:00' })));
    await assertFails(updateDoc(doc(lea(), 'events', 'e1'), { ...content(), authorUid: LEA }));
    await assertFails(updateDoc(doc(lea(), 'events', 'e1'), { ...content(), authorName: 'Someone else' }));
    await assertSucceeds(deleteDoc(doc(lea(), 'events', 'e1')));
  });

  it('rejects malformed events', async () => {
    const events = collection(marc(), 'events');
    await assertFails(addDoc(events, eventDoc(LEA)));
    await assertFails(addDoc(events, eventDoc(MARC, { kind: 'party' })));
    await assertFails(addDoc(events, eventDoc(MARC, { title: '' })));
    await assertFails(addDoc(events, eventDoc(MARC, { title: 'x'.repeat(121) })));
    await assertFails(addDoc(events, eventDoc(MARC, { date: 'bientôt' })));
    await assertFails(addDoc(events, eventDoc(MARC, { start: '25:00' })));
    await assertFails(addDoc(events, eventDoc(MARC, { end: '08:00' }))); // ends before it starts
    await assertFails(addDoc(events, eventDoc(MARC, { start: '', end: '10:00' }))); // an end without a start
    await assertFails(addDoc(events, eventDoc(MARC, { repeatUntil: '2026-01-01' }))); // repeats until before it starts
    await assertFails(addDoc(events, eventDoc(MARC, { target: 'cm2' })));
    await assertFails(addDoc(events, eventDoc(MARC, { place: 'x'.repeat(121) })));
    await assertFails(addDoc(events, eventDoc(MARC, { description: 'x'.repeat(2001) })));
    await assertFails(addDoc(events, eventDoc(MARC, { attachments: Array.from({ length: 11 }, () => ({ label: 'a', url: 'https://a.b' })) })));
    await assertFails(addDoc(events, eventDoc(MARC, { attachments: 'https://a.b' })));
    await assertFails(addDoc(events, eventDoc(MARC, { coefficient: 0 })));
    await assertFails(addDoc(events, eventDoc(MARC, { createdAt: Timestamp.fromMillis(5) })));
    await assertFails(addDoc(events, eventDoc(MARC, { extra: 1 })));
    await assertFails(updateDoc(doc(marc(), 'events', 'e1'), content({ kind: 'party' })));
    await assertFails(updateDoc(doc(marc(), 'events', 'e1'), { ...content(), createdAt: serverTimestamp() }));
  });

});
