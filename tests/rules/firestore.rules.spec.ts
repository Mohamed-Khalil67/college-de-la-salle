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
const SUPER_ADMIN = 'admin-zainab';
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

/** An account with a `role` claim, as set by the role Cloud Functions. `authTime` = sign-in time (s). */
function withRole(uid: string, role: 'examiner' | 'super_admin', authTime = 1_000): Firestore {
  return env
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'google.com' },
      role,
      teacher: true,
      email: `${uid}@school.test`,
      email_verified: true,
      iat: authTime,
      auth_time: authTime,
    })
    .firestore() as unknown as Firestore;
}

/** A directory-listed examiner. */
function examiner(uid = EXAMINER, authTime?: number): Firestore {
  return withRole(uid, 'examiner', authTime);
}

function superAdmin(uid = SUPER_ADMIN, authTime?: number): Firestore {
  return withRole(uid, 'super_admin', authTime);
}

/** A real (Google) account that is NOT on the examiner allow-list: a signed-in candidate. */
function student(uid: string, email: string, verified = true): Firestore {
  return env
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'google.com' },
      email,
      email_verified: verified,
    })
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
    scoring: { passPercent: 50, resultRelease: 'ON_GRADED' },
    delivery: { shuffleQuestions: false, shuffleOptions: false, questionsPerCandidate: null },
    access: { mode: 'CODE' },
    status: 'PUBLISHED',
    lockedAt: null,
    resultsPublished: false,
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
      status: 'PUBLISHED',
      accessMode: 'CODE',
    });
  });
}

async function seedSessionPaper(candidateId = CANDIDATE) {
  await seed((db) =>
    setDoc(doc(db, 'sessionPapers', `${EXAM_ID}_${candidateId}`), {
      examOwnerId: EXAMINER,
      candidateId,
      questions: paper.questions,
    }),
  );
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
  it('candidate with a LIVE session can read THEIR session paper', async () => {
    await seedSession();
    await seedSessionPaper();
    await assertSucceeds(getDoc(doc(candidate(), 'sessionPapers', SESSION_ID)));
  });

  it('candidate can never read the full question bank, even during a live session', async () => {
    await seedSession();
    await assertFails(getDoc(doc(candidate(), 'exams', EXAM_ID, 'paper', 'current')));
  });

  it('candidate can NEVER read the answer key, even during a live session', async () => {
    await seedSession();
    await assertFails(getDoc(doc(candidate(), 'exams', EXAM_ID, 'private', 'answerKey')));
  });

  it('candidate cannot list the private subcollection', async () => {
    await seedSession();
    await assertFails(getDocs(collection(candidate(), 'exams', EXAM_ID, 'private')));
  });

  it('candidate cannot read their session paper after the session expires', async () => {
    await seedSession(CANDIDATE, { expiresAt: ts(-1_000) });
    await seedSessionPaper();
    await assertFails(getDoc(doc(candidate(), 'sessionPapers', SESSION_ID)));
  });

  it('candidate cannot read ANOTHER candidate’s session paper', async () => {
    await seedSession(OTHER_CANDIDATE);
    await seedSessionPaper(OTHER_CANDIDATE);
    await assertFails(getDoc(doc(candidate(), 'sessionPapers', OTHER_SESSION_ID)));
  });

  it('nobody but the server writes session papers', async () => {
    await seedSession();
    await assertFails(
      setDoc(doc(candidate(), 'sessionPapers', SESSION_ID), {
        examOwnerId: EXAMINER,
        candidateId: CANDIDATE,
        questions: [],
      }),
    );
  });

  it('the exam owner can read session papers', async () => {
    await seedSessionPaper();
    await assertSucceeds(getDoc(doc(examiner(), 'sessionPapers', SESSION_ID)));
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
    await assertFails(getDoc(doc(anonymous(), 'sessionPapers', SESSION_ID)));
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
      status: 'PUBLISHED',
      accessMode: 'CODE',
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
      status: 'PUBLISHED',
      accessMode: 'CODE',
    });
    await assertFails(batch.commit());
  });
});

/* ---------------------------------------------------------------------------------------------- */
/* 4. Autosave drafts, released results, and hidden scores                                         */
/* ---------------------------------------------------------------------------------------------- */

function draft(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    examId: EXAM_ID,
    candidateId: CANDIDATE,
    examOwnerId: EXAMINER,
    answers: { q1: 1 },
    flagged: ['q2'],
    integrity: { visibilityLossCount: 0, hiddenMs: 0 },
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

describe('server-side autosave drafts', () => {
  it('candidate can save and re-save their draft while the session is live', async () => {
    await seedSession();
    const ref = doc(candidate(), 'drafts', SESSION_ID);
    await assertSucceeds(setDoc(ref, draft()));
    await assertSucceeds(setDoc(ref, draft({ answers: { q1: 0, q2: 'نص' } })));
    await assertSucceeds(getDoc(ref));
  });

  it('rejects draft writes after the deadline', async () => {
    await seedSession(CANDIDATE, { expiresAt: ts(-1_000) });
    await assertFails(setDoc(doc(candidate(), 'drafts', SESSION_ID), draft()));
  });

  it('rejects a backdated draft timestamp', async () => {
    await seedSession();
    await assertFails(setDoc(doc(candidate(), 'drafts', SESSION_ID), draft({ updatedAt: ts(-60_000) })));
  });

  it('rejects a draft filed under a different exam', async () => {
    await seedSession();
    await assertFails(setDoc(doc(candidate(), 'drafts', SESSION_ID), draft({ examId: 'other-exam' })));
  });

  it('rejects drafts with extra fields (e.g. a smuggled score)', async () => {
    await seedSession();
    await assertFails(setDoc(doc(candidate(), 'drafts', SESSION_ID), draft({ score: 100 })));
  });

  it('candidate cannot write or read another candidate’s draft', async () => {
    await seedSession(OTHER_CANDIDATE);
    await assertFails(
      setDoc(doc(candidate(), 'drafts', OTHER_SESSION_ID), draft({ candidateId: OTHER_CANDIDATE })),
    );
    await seed((db) => setDoc(doc(db, 'drafts', OTHER_SESSION_ID), { ...draft({ candidateId: OTHER_CANDIDATE }), updatedAt: ts(0) }));
    await assertFails(getDoc(doc(candidate(), 'drafts', OTHER_SESSION_ID)));
  });

  it('the owning examiner can watch drafts; another examiner cannot', async () => {
    await seed((db) => setDoc(doc(db, 'drafts', SESSION_ID), { ...draft(), updatedAt: ts(0) }));
    await assertSucceeds(getDoc(doc(examiner(), 'drafts', SESSION_ID)));
    await assertFails(getDoc(doc(examiner(OTHER_EXAMINER), 'drafts', SESSION_ID)));
  });
});

describe('scores stay hidden until released', () => {
  const graded = () => ({
    ...submissionDraft(),
    submittedAt: ts(0),
    expiresAt: ts(4 * MINUTE),
    gradingStatus: 'GRADED',
    score: 2,
    maxScore: 2,
  });

  it('candidate can read their own submission only before it is graded', async () => {
    await seed((db) =>
      setDoc(doc(db, 'submissions', SESSION_ID), { ...submissionDraft(), submittedAt: ts(0), expiresAt: ts(MINUTE) }),
    );
    await assertSucceeds(getDoc(doc(candidate(), 'submissions', SESSION_ID)));

    await seed((db) => setDoc(doc(db, 'submissions', SESSION_ID), graded()));
    await assertFails(getDoc(doc(candidate(), 'submissions', SESSION_ID)));
  });

  it('candidate can probe only their OWN not-yet-existing submission id', async () => {
    await assertSucceeds(getDoc(doc(candidate(), 'submissions', SESSION_ID)));
    await assertFails(getDoc(doc(candidate(), 'submissions', OTHER_SESSION_ID)));
  });

  it('nobody but the server can write results', async () => {
    const result = { candidateId: CANDIDATE, examOwnerId: EXAMINER, score: 99, maxScore: 2 };
    await assertFails(setDoc(doc(candidate(), 'results', SESSION_ID), result));
    await assertFails(setDoc(doc(examiner(), 'results', SESSION_ID), result));
  });

  it('a released result is readable by its candidate and owner only', async () => {
    await seed((db) =>
      setDoc(doc(db, 'results', SESSION_ID), {
        candidateId: CANDIDATE,
        examOwnerId: EXAMINER,
        score: 2,
        maxScore: 2,
      }),
    );
    await assertSucceeds(getDoc(doc(candidate(), 'results', SESSION_ID)));
    await assertSucceeds(getDoc(doc(examiner(), 'results', SESSION_ID)));
    await assertFails(getDoc(doc(candidate(OTHER_CANDIDATE), 'results', SESSION_ID)));
    await assertFails(getDoc(doc(examiner(OTHER_EXAMINER), 'results', SESSION_ID)));
  });

  it('candidate can wait on their own unpublished result without seeing others', async () => {
    await assertSucceeds(getDoc(doc(candidate(), 'results', SESSION_ID)));
    await assertFails(getDoc(doc(candidate(), 'results', OTHER_SESSION_ID)));
  });
});

describe('scoring policy on exams', () => {
  it('rejects a pass mark outside 0–100 and an unknown release mode', async () => {
    const db = examiner();
    await assertFails(
      setDoc(doc(db, 'exams', 'exam-x'), {
        ...examMeta(EXAMINER, 'XYZ789'),
        scoring: { passPercent: 140, resultRelease: 'ON_GRADED' },
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, 'exams', 'exam-y'), {
        ...examMeta(EXAMINER, 'XYZ789'),
        scoring: { passPercent: 60, resultRelease: 'ALWAYS' },
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('an exam cannot be created already "published"', async () => {
    await assertFails(
      setDoc(doc(examiner(), 'exams', 'exam-z'), {
        ...examMeta(EXAMINER, 'XYZ789'),
        resultsPublished: true,
        createdAt: serverTimestamp(),
      }),
    );
  });
});

/* ---------------------------------------------------------------------------------------------- */
/* 5. Roles, exam lifecycle lock, rosters and invitations                                          */
/* ---------------------------------------------------------------------------------------------- */

const STUDENT = 'student-sara';
const STUDENT_EMAIL = 'sara@students.test';

function newExam(overrides: Partial<Record<string, unknown>> = {}) {
  return { ...examMeta(EXAMINER, 'XYZ789'), createdAt: serverTimestamp(), ...overrides };
}

describe('RBAC: roles, administration and revocation', () => {
  const directoryEntry = {
    entry: 'teacher@school.test',
    kind: 'EMAIL',
    role: 'examiner',
    status: 'ACTIVE',
    uid: null,
    updatedAt: Timestamp.now(),
    updatedBy: 'admin-zainab@school.test',
  };
  const auditLine = {
    action: 'GRANT_EXAMINER',
    actorUid: SUPER_ADMIN,
    actorEmail: 'admin-zainab@school.test',
    target: 'teacher@school.test',
    targetUids: [],
    at: Timestamp.now(),
  };

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'examiner_directory', 'teacher@school.test'), directoryEntry);
      await setDoc(doc(db, 'audit_logs', 'log-1'), auditLine);
    });
  });

  it('an examinee (signed-in, no role) cannot author exams', async () => {
    await assertFails(setDoc(doc(student(STUDENT, STUDENT_EMAIL), 'exams', 'exam-s'), {
      ...newExam(),
      ownerId: STUDENT,
    }));
  });

  it('the `role` claim alone grants nothing; only `teacher: true` unlocks authoring', async () => {
    const legacy = env
      .authenticatedContext('legacy-user', {
        firebase: { sign_in_provider: 'google.com' },
        examiner: true,
        role: 'examiner',
        email: 'legacy@school.test',
        email_verified: true,
      })
      .firestore() as unknown as Firestore;
    await assertFails(setDoc(doc(legacy, 'exams', 'exam-l'), { ...newExam(), ownerId: 'legacy-user' }));
  });

  it('the super admin can author exams too', async () => {
    await assertSucceeds(setDoc(doc(superAdmin(), 'exams', 'exam-a'), { ...newExam(), ownerId: SUPER_ADMIN }));
  });

  it('only the super admin can read the examiner directory and the audit log', async () => {
    await assertSucceeds(getDoc(doc(superAdmin(), 'examiner_directory', 'teacher@school.test')));
    await assertSucceeds(getDocs(collection(superAdmin(), 'examiner_directory')));
    await assertSucceeds(getDocs(collection(superAdmin(), 'audit_logs')));

    for (const db of [examiner(), student(STUDENT, STUDENT_EMAIL), candidate(), anonymous()]) {
      await assertFails(getDoc(doc(db, 'examiner_directory', 'teacher@school.test')));
      await assertFails(getDocs(collection(db, 'examiner_directory')));
      await assertFails(getDoc(doc(db, 'audit_logs', 'log-1')));
      await assertFails(getDocs(collection(db, 'audit_logs')));
    }
  });

  it('nobody — not even the super admin — can grant roles by writing the directory from a client', async () => {
    for (const db of [superAdmin(), examiner(), student(STUDENT, STUDENT_EMAIL)]) {
      await assertFails(setDoc(doc(db, 'examiner_directory', 'me@school.test'), { ...directoryEntry, entry: 'me@school.test' }));
      await assertFails(updateDoc(doc(db, 'examiner_directory', 'teacher@school.test'), { status: 'REVOKED' }));
      await assertFails(deleteDoc(doc(db, 'examiner_directory', 'teacher@school.test')));
    }
  });

  it('the audit log is immutable: no client create, edit or delete', async () => {
    const admin = superAdmin();
    await assertFails(setDoc(doc(admin, 'audit_logs', 'log-2'), auditLine));
    await assertFails(updateDoc(doc(admin, 'audit_logs', 'log-1'), { target: 'someone-else@school.test' }));
    await assertFails(deleteDoc(doc(admin, 'audit_logs', 'log-1')));
  });

  it('revocation metadata is server-only', async () => {
    await assertFails(getDoc(doc(superAdmin(), 'user_metadata', EXAMINER)));
    await assertFails(setDoc(doc(examiner(), 'user_metadata', EXAMINER), { revokeTime: 0 }));
  });

  it('a token minted before a revocation loses examiner access, even though its claim still says examiner', async () => {
    await seed((db) => setDoc(doc(db, 'user_metadata', EXAMINER), { revokeTime: 5_000 }));

    const stale = examiner(EXAMINER, 4_000);
    await assertFails(getDoc(doc(stale, 'exams', EXAM_ID)));
    await assertFails(getDoc(doc(stale, 'exams', EXAM_ID, 'private', 'answerKey')));
    await assertFails(getDocs(query(collection(stale, 'submissions'), where('examOwnerId', '==', EXAMINER))));
    await assertFails(setDoc(doc(stale, 'exams', 'exam-new'), { ...newExam() }));

    // After signing in again (and being re-granted), access resumes.
    const fresh = examiner(EXAMINER, 6_000);
    await assertSucceeds(getDoc(doc(fresh, 'exams', EXAM_ID)));
  });

  it('a revoked super admin token cannot read the audit log', async () => {
    await seed((db) => setDoc(doc(db, 'user_metadata', SUPER_ADMIN), { revokeTime: 5_000 }));
    await assertFails(getDocs(collection(superAdmin(SUPER_ADMIN, 4_000), 'audit_logs')));
    await assertSucceeds(getDocs(collection(superAdmin(SUPER_ADMIN, 6_000), 'audit_logs')));
  });
});

describe('exam lifecycle lock', () => {
  beforeEach(async () => {
    await seed((db) => updateDoc(doc(db, 'exams', EXAM_ID), { lockedAt: ts(-MINUTE) }));
  });

  it('once a candidate has started, questions and answers are frozen', async () => {
    const db = examiner();
    await assertFails(updateDoc(doc(db, 'exams', EXAM_ID), { title: 'changed' }));
    await assertFails(setDoc(doc(db, 'exams', EXAM_ID, 'paper', 'current'), paper));
    await assertFails(
      setDoc(doc(db, 'exams', EXAM_ID, 'private', 'answerKey'), { ownerId: EXAMINER, answers: { q1: 0 } }),
    );
  });

  it('…but the examiner can still close the exam and edit the roster', async () => {
    const db = examiner();
    await assertSucceeds(updateDoc(doc(db, 'exams', EXAM_ID), { status: 'CLOSED' }));
    await assertSucceeds(
      setDoc(doc(db, 'exams', EXAM_ID, 'private', 'roster'), { ownerId: EXAMINER, emails: [STUDENT_EMAIL] }),
    );
  });

  it('an examiner cannot unlock an exam by clearing lockedAt', async () => {
    await assertFails(updateDoc(doc(examiner(), 'exams', EXAM_ID), { lockedAt: null }));
  });

  it('a locked exam cannot be deleted', async () => {
    await assertFails(deleteDoc(doc(examiner(), 'exams', EXAM_ID)));
  });

  it('an exam cannot be created already locked', async () => {
    await assertFails(setDoc(doc(examiner(), 'exams', 'exam-l'), newExam({ lockedAt: ts(0) })));
  });

  it('rejects an invalid question-bank draw size', async () => {
    await assertFails(
      setDoc(
        doc(examiner(), 'exams', 'exam-d'),
        newExam({ delivery: { shuffleQuestions: true, shuffleOptions: true, questionsPerCandidate: 5 } }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(examiner(), 'exams', 'exam-d'),
        newExam({ delivery: { shuffleQuestions: true, shuffleOptions: true, questionsPerCandidate: 1 } }),
      ),
    );
  });
});

describe('rosters and invitations', () => {
  const inviteId = `${EXAM_ID}__${STUDENT_EMAIL}`;
  const invitation = {
    examId: EXAM_ID,
    ownerId: EXAMINER,
    email: STUDENT_EMAIL,
    code: ACCESS_CODE,
    title: 'Distributed Systems Midterm',
    durationSeconds: 300,
    window: examMeta().window,
    status: 'PUBLISHED',
  };

  it('the roster is private to the owner', async () => {
    await seed((db) =>
      setDoc(doc(db, 'exams', EXAM_ID, 'private', 'roster'), { ownerId: EXAMINER, emails: [STUDENT_EMAIL] }),
    );
    await assertSucceeds(getDoc(doc(examiner(), 'exams', EXAM_ID, 'private', 'roster')));
    await assertFails(getDoc(doc(student(STUDENT, STUDENT_EMAIL), 'exams', EXAM_ID, 'private', 'roster')));
  });

  it('the owner can invite; the invited, verified email can find the invitation', async () => {
    await assertSucceeds(setDoc(doc(examiner(), 'invitations', inviteId), invitation));
    await assertSucceeds(getDoc(doc(student(STUDENT, STUDENT_EMAIL), 'invitations', inviteId)));
    await assertSucceeds(
      getDocs(
        query(collection(student(STUDENT, STUDENT_EMAIL), 'invitations'), where('email', '==', STUDENT_EMAIL)),
      ),
    );
  });

  it('nobody else can see the invitation — not other students, not unverified emails', async () => {
    await seed((db) => setDoc(doc(db, 'invitations', inviteId), invitation));
    await assertFails(getDoc(doc(student('mallory', 'mallory@students.test'), 'invitations', inviteId)));
    await assertFails(getDoc(doc(student('spoof', STUDENT_EMAIL, false), 'invitations', inviteId)));
    await assertFails(getDoc(doc(candidate(), 'invitations', inviteId)));
  });

  it('students cannot invite themselves, and examiners cannot invite to someone else’s exam', async () => {
    await assertFails(setDoc(doc(student(STUDENT, STUDENT_EMAIL), 'invitations', inviteId), invitation));
    await assertFails(
      setDoc(doc(examiner(OTHER_EXAMINER), 'invitations', inviteId), { ...invitation, ownerId: OTHER_EXAMINER }),
    );
  });

  it('the invitation id must match its exam and email', async () => {
    await assertFails(setDoc(doc(examiner(), 'invitations', `${EXAM_ID}__someone@else.test`), invitation));
  });
});
describe('public portal and practice catalog', () => {
  const card = (overrides: Record<string, unknown> = {}) => ({
    examId: EXAM_ID,
    ownerId: EXAMINER,
    subjectId: 'arabic',
    title: 'تدريب النحو',
    code: ACCESS_CODE,
    durationSeconds: 300,
    questionCount: 2,
    publishedAt: serverTimestamp(),
    ...overrides,
  });

  const page = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    lang: id === 'mathematiques' ? 'fr' : 'ar',
    hero: { title: 'Mathématiques', subtitle: 'Thanaweya Amma', intro: 'Intro' },
    summary: 'Résumé',
    timeline: [],
    chapters: [{ id: 'c1', title: 'Analyse', summary: '', topics: ['Limites'] }],
    resources: [],
    announcements: [],
    updatedAt: serverTimestamp(),
    updatedBy: EXAMINER,
    ...overrides,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'content_pages', 'mathematiques'), page('mathematiques', { updatedAt: Timestamp.now() }));
      await setDoc(doc(db, 'practice_catalog', 'listed-exam'), { ...card(), examId: 'listed-exam', publishedAt: Timestamp.now() });
    });
  });

  it('signed-out visitors can read content pages and practice cards', async () => {
    const visitor = anonymous();
    await assertSucceeds(getDoc(doc(visitor, 'content_pages', 'mathematiques')));
    await assertSucceeds(getDocs(collection(visitor, 'content_pages')));
    await assertSucceeds(getDocs(query(collection(visitor, 'practice_catalog'), where('subjectId', '==', 'arabic'))));
  });

  it('only a teacher can write content pages', async () => {
    await assertSucceeds(setDoc(doc(examiner(), 'content_pages', 'mathematiques'), page('mathematiques')));
    await assertSucceeds(setDoc(doc(superAdmin(), 'content_pages', 'home'), page('home', { updatedBy: SUPER_ADMIN })));

    for (const db of [student(STUDENT, STUDENT_EMAIL), candidate(), anonymous()]) {
      await assertFails(setDoc(doc(db, 'content_pages', 'mathematiques'), page('mathematiques')));
      await assertFails(updateDoc(doc(db, 'content_pages', 'mathematiques'), { summary: 'piraté' }));
      await assertFails(deleteDoc(doc(db, 'content_pages', 'mathematiques')));
    }
  });

  it('a teacher whose role was revoked (stale token) cannot edit content', async () => {
    await seed((db) => setDoc(doc(db, 'user_metadata', EXAMINER), { revokeTime: 5_000 }));
    await assertFails(setDoc(doc(examiner(EXAMINER, 4_000), 'content_pages', 'mathematiques'), page('mathematiques')));
    await assertSucceeds(setDoc(doc(examiner(EXAMINER, 6_000), 'content_pages', 'mathematiques'), page('mathematiques')));
  });

  it('content pages are validated: id, size, shape, server time and author', async () => {
    const t = examiner();
    await assertFails(setDoc(doc(t, 'content_pages', 'unknown-page'), page('unknown-page')));
    await assertFails(setDoc(doc(t, 'content_pages', 'mathematiques'), page('home')));
    await assertFails(setDoc(doc(t, 'content_pages', 'mathematiques'), page('mathematiques', { lang: 'en' })));
    await assertFails(setDoc(doc(t, 'content_pages', 'mathematiques'), page('mathematiques', { summary: 'x'.repeat(5001) })));
    await assertFails(setDoc(doc(t, 'content_pages', 'mathematiques'), page('mathematiques', { hero: { title: 'x', subtitle: '', intro: '', html: '<b>' } })));
    await assertFails(setDoc(doc(t, 'content_pages', 'mathematiques'), page('mathematiques', { chapters: Array.from({ length: 41 }, (_, i) => ({ id: `c${i}`, title: 't', summary: '', topics: [] })) })));
    await assertFails(setDoc(doc(t, 'content_pages', 'mathematiques'), page('mathematiques', { updatedAt: Timestamp.fromMillis(1) })));
    await assertFails(setDoc(doc(t, 'content_pages', 'mathematiques'), page('mathematiques', { updatedBy: 'someone-else' })));
    await assertFails(setDoc(doc(t, 'content_pages', 'mathematiques'), page('mathematiques', { extra: 1 })));
  });

  it('the old school_content, news and curriculum collections are gone: nobody writes them', async () => {
    for (const col of ['school_content', 'news', 'curriculum']) {
      await assertFails(setDoc(doc(superAdmin(), col, 'x'), { title: 'x' }));
      await assertFails(getDoc(doc(anonymous(), col, 'x')));
    }
  });

  it('signed-out visitors can never read question banks, answer keys or rubrics', async () => {
    const visitor = anonymous();
    await assertFails(getDoc(doc(visitor, 'exams', EXAM_ID)));
    await assertFails(getDoc(doc(visitor, 'exams', EXAM_ID, 'paper', 'current')));
    await assertFails(getDoc(doc(visitor, 'exams', EXAM_ID, 'private', 'answerKey')));
    await assertFails(getDocs(collection(visitor, 'sessionPapers')));
  });
  it('an examiner lists their own published, code-access exam on a subject hub', async () => {
    await assertSucceeds(setDoc(doc(examiner(), 'practice_catalog', EXAM_ID), card()));
  });

  it('a card must match the exam: owner, code, published status and code access', async () => {
    await assertFails(setDoc(doc(examiner(OTHER_EXAMINER), 'practice_catalog', EXAM_ID), card({ ownerId: OTHER_EXAMINER })));
    await assertFails(setDoc(doc(examiner(), 'practice_catalog', EXAM_ID), card({ code: 'ZZZ999' })));
    await assertFails(setDoc(doc(examiner(), 'practice_catalog', EXAM_ID), card({ subjectId: 'biologie' })));
    await assertFails(setDoc(doc(examiner(), 'practice_catalog', EXAM_ID), card({ answers: { q1: 0 } })));

    await seed((db) => updateDoc(doc(db, 'exams', EXAM_ID), { status: 'DRAFT' }));
    await assertFails(setDoc(doc(examiner(), 'practice_catalog', EXAM_ID), card()));

    await seed((db) => updateDoc(doc(db, 'exams', EXAM_ID), { status: 'PUBLISHED', access: { mode: 'ROSTER' } }));
    await assertFails(setDoc(doc(examiner(), 'practice_catalog', EXAM_ID), card()));
  });

  it('candidates and visitors cannot publish or remove practice cards', async () => {
    await assertFails(setDoc(doc(candidate(), 'practice_catalog', EXAM_ID), card({ ownerId: CANDIDATE })));
    await assertFails(setDoc(doc(anonymous(), 'practice_catalog', EXAM_ID), card()));
    await assertFails(deleteDoc(doc(candidate(), 'practice_catalog', 'listed-exam')));
    await assertFails(deleteDoc(doc(examiner(OTHER_EXAMINER), 'practice_catalog', 'listed-exam')));
    await assertSucceeds(deleteDoc(doc(examiner(), 'practice_catalog', 'listed-exam')));
  });
});