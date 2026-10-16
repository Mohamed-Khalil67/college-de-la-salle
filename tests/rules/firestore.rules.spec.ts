/**
 * Security-rules suite. Runs against the Firestore emulator:
 *
 *   npm run test:rules
 *
 * The suite proves the three guarantees of the security model:
 *   1. Zero-trust answer protection — the answer key is unreadable by candidates.
 *   2. Tamper-proof timing — candidates cannot mint, extend, reset or outrun the session timer.
 *   3. Examiner isolation — creators see only their own exams and submissions.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
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
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'demo-exam-rules';

const EXAMINER = 'examiner-alice';
const OTHER_EXAMINER = 'examiner-bob';
const CANDIDATE = 'candidate-carol';
const OTHER_CANDIDATE = 'candidate-dave';

const EXAM_ID = 'exam-1';
const ACCESS_CODE = 'ABC234';
const SESSION_ID = `${EXAM_ID}_${CANDIDATE}`;
const OTHER_SESSION_ID = `${EXAM_ID}_${OTHER_CANDIDATE}`;

const MINUTE = 60_000;

let env: RulesTestEnvironment;

/* ---------------------------------------------------------------------------------------------- */
/* Contexts                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

function examiner(uid = EXAMINER): Firestore {
  return env
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } })
    .firestore() as unknown as Firestore;
}

function candidate(uid = CANDIDATE): Firestore {
  return env
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore() as unknown as Firestore;
}

function anonymous(): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}

/* ---------------------------------------------------------------------------------------------- */
/* Fixtures                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

const ts = (offsetMs: number) => Timestamp.fromMillis(Date.now() + offsetMs);

function examMeta(ownerId = EXAMINER, accessCode = ACCESS_CODE) {
  return {
    ownerId,
    title: 'Distributed Systems Midterm',
    description: '',
    durationSeconds: 300,
    window: { opensAt: ts(-60 * MINUTE), closesAt: ts(60 * MINUTE) },
    accessCode,
    integrity: { maxVisibilityLosses: 3 },
    questionCount: 2,
    maxScore: 2,
    createdAt: ts(-61 * MINUTE),
  };
}

const paper = {
  ownerId: EXAMINER,
  questions: [
    { id: 'q1', prompt: 'CAP: pick two?', options: ['CA', 'CP', 'AP'], points: 1 },
    { id: 'q2', prompt: 'Raft leader election uses?', options: ['Terms', 'Tokens'], points: 1 },
  ],
};

const answerKey = { ownerId: EXAMINER, answers: { q1: 1, q2: 0 } };

function session(
  candidateId: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    examId: EXAM_ID,
    examOwnerId: EXAMINER,
    examTitle: 'Distributed Systems Midterm',
    candidateId,
    candidateName: candidateId,
    startedAt: ts(-1 * MINUTE),
    expiresAt: ts(4 * MINUTE),
    status: 'ACTIVE',
    integrity: { maxVisibilityLosses: 3 },
    submittedAt: null,
    ...overrides,
  };
}

function submissionDraft(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sessionId: SESSION_ID,
    examId: EXAM_ID,
    examOwnerId: EXAMINER,
    candidateId: CANDIDATE,
    candidateName: CANDIDATE,
    answers: { q1: 1, q2: 0 },
    integrity: { visibilityLossCount: 0, hiddenMs: 0 },
    completedBy: 'CANDIDATE',
    submittedAt: serverTimestamp(),
    ...overrides,
  };
}

/** Reads the session's server-minted expiry so a submission can (legitimately) copy it. */
async function sessionExpiry(sessionId = SESSION_ID): Promise<Timestamp> {
  let expiresAt!: Timestamp;
  await env.withSecurityRulesDisabled(async (ctx: RulesTestContext) => {
    const snap = await getDoc(doc(ctx.firestore() as unknown as Firestore, 'sessions', sessionId));
    expiresAt = snap.get('expiresAt') as Timestamp;
  });
  return expiresAt;
}

async function seed(write: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((ctx) => write(ctx.firestore() as unknown as Firestore));
}

async function seedExam() {
  await seed(async (db) => {
    await setDoc(doc(db, 'exams', EXAM_ID), examMeta());
    await setDoc(doc(db, 'exams', EXAM_ID, 'paper', 'current'), paper);
    await setDoc(doc(db, 'exams', EXAM_ID, 'private', 'answerKey'), answerKey);
    await setDoc(doc(db, 'accessCodes', ACCESS_CODE), {
      code: ACCESS_CODE,
      examId: EXAM_ID,
      ownerId: EXAMINER,
      title: 'Distributed Systems Midterm',
      description: '',
      durationSeconds: 300,
      questionCount: 2,
      window: examMeta().window,
    });
  });
}

async function seedSession(candidateId = CANDIDATE, overrides = {}) {
  await seed((db) =>
    setDoc(doc(db, 'sessions', `${EXAM_ID}_${candidateId}`), session(candidateId, overrides)),
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Lifecycle                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

beforeAll(async () => {
  const [host, port] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host,
      port: Number(port),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedExam();
});

afterAll(async () => {
  await env?.cleanup();
});

/* ---------------------------------------------------------------------------------------------- */
/* 1. Zero-trust answer protection                                                                 */
/* ---------------------------------------------------------------------------------------------- */

describe('answer key protection', () => {
  it('candidate with a LIVE session can read the question paper', async () => {
    await seedSession();
    await assertSucceeds(getDoc(doc(candidate(), 'exams', EXAM_ID, 'paper', 'current')));
  });

  it('candidate can NEVER read the answer key, even during a live session', async () => {
    await seedSession();
    await assertFails(getDoc(doc(candidate(), 'exams', EXAM_ID, 'private', 'answerKey')));
  });

  it('candidate cannot list the private subcollection', async () => {
    await seedSession();
    await assertFails(getDocs(collection(candidate(), 'exams', EXAM_ID, 'private')));
  });

  it('candidate cannot read the paper before their session exists', async () => {
    await assertFails(getDoc(doc(candidate(), 'exams', EXAM_ID, 'paper', 'current')));
  });

  it('candidate cannot read the paper after their session expires', async () => {
    await seedSession(CANDIDATE, { expiresAt: ts(-1_000) });
    await assertFails(getDoc(doc(candidate(), 'exams', EXAM_ID, 'paper', 'current')));
  });

  it('candidate cannot read the paper through ANOTHER candidate’s session', async () => {
    await seedSession(OTHER_CANDIDATE);
    await assertFails(getDoc(doc(candidate(), 'exams', EXAM_ID, 'paper', 'current')));
  });

  it('candidate cannot read exam metadata directly', async () => {
    await seedSession();
    await assertFails(getDoc(doc(candidate(), 'exams', EXAM_ID)));
  });

  it('candidate cannot plant a paper to sneak a key into it', async () => {
    await assertFails(
      setDoc(doc(candidate(), 'exams', EXAM_ID, 'paper', 'current'), {
        ...paper,
        ownerId: CANDIDATE,
      }),
    );
  });

  it('owner can read their own answer key', async () => {
    await assertSucceeds(getDoc(doc(examiner(), 'exams', EXAM_ID, 'private', 'answerKey')));
  });

  it('unauthenticated users can read nothing', async () => {
    await assertFails(getDoc(doc(anonymous(), 'accessCodes', ACCESS_CODE)));
    await assertFails(getDoc(doc(anonymous(), 'exams', EXAM_ID, 'paper', 'current')));
  });

  it('signed-in users can resolve an access code but cannot enumerate codes', async () => {
    await assertSucceeds(getDoc(doc(candidate(), 'accessCodes', ACCESS_CODE)));
    await assertFails(getDocs(collection(candidate(), 'accessCodes')));
  });
});

/* ---------------------------------------------------------------------------------------------- */
/* 2. Tamper-proof timing                                                                          */
/* ---------------------------------------------------------------------------------------------- */

describe('timer tamper resistance', () => {
  it('candidate cannot mint their own session (forged startedAt/expiresAt)', async () => {
    await assertFails(
      setDoc(
        doc(candidate(), 'sessions', SESSION_ID),
        session(CANDIDATE, { startedAt: ts(0), expiresAt: ts(600 * MINUTE) }),
      ),
    );
  });

  it('candidate cannot extend their session expiry', async () => {
    await seedSession();
    await assertFails(
      updateDoc(doc(candidate(), 'sessions', SESSION_ID), { expiresAt: ts(600 * MINUTE) }),
    );
  });

  it('candidate cannot revive an expired session by flipping its status', async () => {
    await seedSession(CANDIDATE, { status: 'EXPIRED', expiresAt: ts(-MINUTE) });
    await assertFails(updateDoc(doc(candidate(), 'sessions', SESSION_ID), { status: 'ACTIVE' }));
  });

  it('candidate cannot delete their session to restart the clock', async () => {
    await seedSession();
    await assertFails(deleteDoc(doc(candidate(), 'sessions', SESSION_ID)));
  });

  it('accepts a well-formed submission before the deadline', async () => {
    await seedSession();
    await assertSucceeds(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({ expiresAt: await sessionExpiry() }),
      ),
    );
  });

  it('rejects a submission once request.time > expiresAt', async () => {
    await seedSession(CANDIDATE, { expiresAt: ts(-1_000) });
    await assertFails(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({ expiresAt: await sessionExpiry() }),
      ),
    );
  });

  it('rejects a submission that forges a later expiresAt than the session', async () => {
    await seedSession(CANDIDATE, { expiresAt: ts(-1_000) });
    await assertFails(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({ expiresAt: ts(60 * MINUTE) }),
      ),
    );
  });

  it('rejects a client-supplied completion timestamp (must be request.time)', async () => {
    await seedSession();
    await assertFails(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({ expiresAt: await sessionExpiry(), submittedAt: ts(-2 * MINUTE) }),
      ),
    );
  });

  it('rejects a submission that self-assigns a score', async () => {
    await seedSession();
    await assertFails(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({ expiresAt: await sessionExpiry(), score: 100, maxScore: 100 }),
      ),
    );
  });

  it('rejects a submission against a session that is no longer ACTIVE', async () => {
    await seedSession(CANDIDATE, { status: 'SUBMITTED' });
    await assertFails(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({ expiresAt: await sessionExpiry() }),
      ),
    );
  });

  it('a submission is final: no overwrite, no edit, no delete', async () => {
    await seedSession();
    const ref = doc(candidate(), 'submissions', SESSION_ID);
    await assertSucceeds(setDoc(ref, submissionDraft({ expiresAt: await sessionExpiry() })));

    await assertFails(setDoc(ref, submissionDraft({ expiresAt: await sessionExpiry() })));
    await assertFails(updateDoc(ref, { answers: { q1: 2, q2: 1 } }));
    await assertFails(updateDoc(ref, { score: 2 }));
    await assertFails(deleteDoc(ref));
  });

  it('candidate cannot submit into another candidate’s session', async () => {
    await seedSession(OTHER_CANDIDATE);
    await assertFails(
      setDoc(
        doc(candidate(), 'submissions', OTHER_SESSION_ID),
        submissionDraft({
          sessionId: OTHER_SESSION_ID,
          expiresAt: await sessionExpiry(OTHER_SESSION_ID),
        }),
      ),
    );
  });

  it('submission cannot be redirected to a different examiner', async () => {
    await seedSession();
    await assertFails(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({ expiresAt: await sessionExpiry(), examOwnerId: OTHER_EXAMINER }),
      ),
    );
  });
});

/* ---------------------------------------------------------------------------------------------- */
/* 2b. Written answers & grading integrity                                                         */
/* ---------------------------------------------------------------------------------------------- */

describe('written answers and grading', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'exams', EXAM_ID, 'paper', 'current'), {
        ownerId: EXAMINER,
        questions: [
          ...paper.questions.map((q) => ({ ...q, type: 'CHOICE' })),
          { id: 'q3', type: 'TEXT', prompt: 'Explain Raft terms.', points: 4, maxLength: 2000 },
        ],
      });
      await setDoc(doc(db, 'exams', EXAM_ID, 'private', 'answerKey'), {
        ...answerKey,
        rubrics: { q3: { modelAnswer: 'Monotonic epochs…', criteria: '2 pts: epochs; 2 pts: stale leaders' } },
      });
    });
    await seedSession();
  });

  it('accepts a submission mixing option indexes and free text', async () => {
    await assertSucceeds(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({
          expiresAt: await sessionExpiry(),
          answers: { q1: 1, q2: 0, q3: 'Terms are monotonically increasing epochs…' },
        }),
      ),
    );
  });

  it('candidate can never read the rubric (it lives with the answer key)', async () => {
    await assertFails(getDoc(doc(candidate(), 'exams', EXAM_ID, 'private', 'answerKey')));
  });

  it('candidate cannot self-grade a written answer at submit time', async () => {
    await assertFails(
      setDoc(
        doc(candidate(), 'submissions', SESSION_ID),
        submissionDraft({
          expiresAt: await sessionExpiry(),
          manualScores: { q3: { points: 4 } },
        }),
      ),
    );
  });

  it('even the owning examiner cannot write grades directly (only via Cloud Functions)', async () => {
    await seed((db) =>
      setDoc(doc(db, 'submissions', SESSION_ID), {
        ...submissionDraft({ answers: { q3: 'text' } }),
        submittedAt: ts(0),
        expiresAt: ts(4 * MINUTE),
        gradingStatus: 'NEEDS_REVIEW',
        autoScore: 2,
        score: null,
      }),
    );
    const ref = doc(examiner(), 'submissions', SESSION_ID);
    await assertSucceeds(getDoc(ref));
    await assertFails(updateDoc(ref, { 'manualScores.q3': { points: 4 }, score: 6 }));
    await assertFails(updateDoc(ref, { 'aiSuggestions.q3': { points: 4 } }));
  });

  it('owner can store rubrics in the answer key', async () => {
    await assertSucceeds(
      setDoc(doc(examiner(), 'exams', EXAM_ID, 'private', 'answerKey'), {
        ownerId: EXAMINER,
        answers: { q1: 1 },
        rubrics: { q3: { modelAnswer: '', criteria: 'x' } },
      }),
    );
  });
});

/* ---------------------------------------------------------------------------------------------- */
/* 3. Examiner & candidate isolation                                                               */
/* ---------------------------------------------------------------------------------------------- */

describe('isolation', () => {
  beforeEach(async () => {
    await seedSession(CANDIDATE);
    await seedSession(OTHER_CANDIDATE);
    await seed((db) =>
      setDoc(doc(db, 'submissions', OTHER_SESSION_ID), {
        ...submissionDraft({ sessionId: OTHER_SESSION_ID, candidateId: OTHER_CANDIDATE }),
        submittedAt: ts(0),
        expiresAt: ts(4 * MINUTE),
        score: 2,
        maxScore: 2,
      }),
    );
  });

  it('candidate cannot read another candidate’s submission', async () => {
    await assertFails(getDoc(doc(candidate(), 'submissions', OTHER_SESSION_ID)));
  });

  it('candidate cannot read another candidate’s session', async () => {
    await assertFails(getDoc(doc(candidate(), 'sessions', OTHER_SESSION_ID)));
  });

  it('candidate can read only their own session', async () => {
    await assertSucceeds(getDoc(doc(candidate(), 'sessions', SESSION_ID)));
  });

  it('candidate cannot query all submissions for an exam', async () => {
    await assertFails(
      getDocs(query(collection(candidate(), 'submissions'), where('examId', '==', EXAM_ID))),
    );
  });

  it('owner can query submissions to their exams', async () => {
    await assertSucceeds(
      getDocs(query(collection(examiner(), 'submissions'), where('examOwnerId', '==', EXAMINER))),
    );
  });

  it('another examiner cannot read the exam, its key, or its submissions', async () => {
    const bob = examiner(OTHER_EXAMINER);
    await assertFails(getDoc(doc(bob, 'exams', EXAM_ID)));
    await assertFails(getDoc(doc(bob, 'exams', EXAM_ID, 'private', 'answerKey')));
    await assertFails(getDoc(doc(bob, 'submissions', OTHER_SESSION_ID)));
    await assertFails(
      getDocs(query(collection(bob, 'submissions'), where('examOwnerId', '==', EXAMINER))),
    );
  });

  it('another examiner cannot overwrite or hijack an exam', async () => {
    const bob = examiner(OTHER_EXAMINER);
    await assertFails(setDoc(doc(bob, 'exams', EXAM_ID), examMeta(OTHER_EXAMINER)));
    await assertFails(updateDoc(doc(bob, 'exams', EXAM_ID), { title: 'pwned' }));
    await assertFails(
      setDoc(doc(bob, 'exams', EXAM_ID, 'private', 'answerKey'), {
        ownerId: OTHER_EXAMINER,
        answers: {},
      }),
    );
  });

  it('examiner can create an exam atomically (meta + paper + key + code)', async () => {
    const db = examiner();
    const batch = writeBatch(db);
    batch.set(doc(db, 'exams', 'exam-2'), {
      ...examMeta(EXAMINER, 'XYZ789'),
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'exams', 'exam-2', 'paper', 'current'), paper);
    batch.set(doc(db, 'exams', 'exam-2', 'private', 'answerKey'), answerKey);
    batch.set(doc(db, 'accessCodes', 'XYZ789'), {
      code: 'XYZ789',
      examId: 'exam-2',
      ownerId: EXAMINER,
      title: 'x',
      description: '',
      durationSeconds: 300,
      questionCount: 2,
      window: examMeta().window,
    });
    await assertSucceeds(batch.commit());
  });

  it('examiner cannot create an exam on behalf of someone else', async () => {
    await assertFails(
      setDoc(doc(examiner(), 'exams', 'exam-3'), {
        ...examMeta(OTHER_EXAMINER, 'XYZ789'),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('anonymous (candidate) identities cannot author exams', async () => {
    await assertFails(
      setDoc(doc(candidate(), 'exams', 'exam-3'), {
        ...examMeta(CANDIDATE, 'XYZ789'),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('another examiner cannot hijack an existing access code', async () => {
    const bob = examiner(OTHER_EXAMINER);
    const batch = writeBatch(bob);
    batch.set(doc(bob, 'exams', 'bob-exam'), {
      ...examMeta(OTHER_EXAMINER, ACCESS_CODE),
      createdAt: serverTimestamp(),
    });
    batch.set(doc(bob, 'accessCodes', ACCESS_CODE), {
      code: ACCESS_CODE,
      examId: 'bob-exam',
      ownerId: OTHER_EXAMINER,
      title: 'phish',
      description: '',
      durationSeconds: 300,
      questionCount: 2,
      window: examMeta().window,
    });
    await assertFails(batch.commit());
  });
});
