import { Service, inject } from '@angular/core';
import {
  type AccessCodeRecord,
  COLLECTIONS,
  type ExamDraft,
  type ExamPaper,
  type ExamResult,
  normalizeAccessCode,
  PAPER_DOC_ID,
  type StartSessionRequest,
  type StartSessionResponse,
  type SubmissionDraft,
} from '@exam/contracts';
import {
  doc,
  FirestoreError,
  getDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AuthStore } from './auth.store';
import { FIREBASE_FUNCTIONS, FIRESTORE } from './firebase.providers';
import {
  accessCodeConverter,
  draftConverter,
  examPaperConverter,
  resultConverter,
} from './firestore-converters';
import { ServerClock } from './server-clock';

export type DraftPayload = Pick<
  ExamDraft,
  'examId' | 'candidateId' | 'examOwnerId' | 'answers' | 'flagged' | 'integrity'
>;

/** Candidate-side I/O. Everything the exam runner touches goes through this one gateway. */
@Service()
export class ExamSessionGateway {
  readonly #db = inject(FIRESTORE);
  readonly #functions = inject(FIREBASE_FUNCTIONS);
  readonly #auth = inject(AuthStore);
  readonly #clock = inject(ServerClock);

  async lookupAccessCode(rawCode: string): Promise<AccessCodeRecord | null> {
    await this.#auth.ensureCandidate();
    const ref = doc(this.#db, COLLECTIONS.accessCodes, normalizeAccessCode(rawCode)).withConverter(
      accessCodeConverter,
    );
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  /**
   * Authoritative session start. The callable mints startedAt/expiresAt from the server clock and
   * returns `serverNow`, which calibrates the local {@link ServerClock}. Idempotent on reconnect.
   */
  async startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
    await this.#auth.ensureCandidate();
    const call = httpsCallable<StartSessionRequest, StartSessionResponse>(
      this.#functions,
      'startSession',
    );
    const sentAt = Date.now();
    const { data } = await call(request);
    this.#clock.calibrate(data.serverNow, sentAt, Date.now());
    return data;
  }

  /** Readable only while the caller's session is live — enforced by rules, not by this code. */
  async loadPaper(examId: string): Promise<ExamPaper> {
    const ref = doc(this.#db, COLLECTIONS.exams, examId, COLLECTIONS.paper, PAPER_DOC_ID);
    const snap = await getDocFromServer(ref.withConverter(examPaperConverter));
    if (!snap.exists()) throw new Error('ورقة الأسئلة غير متاحة.');
    return snap.data();
  }

  /* -------------------------------------------------------------------------------------------- */
  /* Server-side autosave                                                                         */
  /* -------------------------------------------------------------------------------------------- */

  /**
   * Saves the candidate's work-in-progress. Rules accept it only while the session is live and
   * stamp it with server time. If the device dies, the server turns this draft into the submission
   * when the session expires.
   */
  async saveDraft(sessionId: string, draft: DraftPayload): Promise<void> {
    await setDoc(doc(this.#db, COLLECTIONS.drafts, sessionId), {
      ...draft,
      updatedAt: serverTimestamp(),
    });
  }

  async loadDraft(sessionId: string): Promise<ExamDraft | null> {
    try {
      const snap = await getDocFromServer(
        doc(this.#db, COLLECTIONS.drafts, sessionId).withConverter(draftConverter),
      );
      return snap.exists() ? snap.data() : null;
    } catch {
      return null; // offline: fall back to the local copy
    }
  }

  /* -------------------------------------------------------------------------------------------- */
  /* Submission                                                                                   */
  /* -------------------------------------------------------------------------------------------- */

  /**
   * One-shot submission. `submittedAt` is the server's `request.time`; `expiresAt` is echoed back
   * exactly so the rules can pin it to the session and reject anything after the deadline.
   */
  async submit(draft: SubmissionDraft): Promise<void> {
    await setDoc(doc(this.#db, COLLECTIONS.submissions, draft.sessionId), {
      ...draft,
      expiresAt: Timestamp.fromMillis(draft.expiresAt),
      submittedAt: serverTimestamp(),
    });
  }

  /**
   * Used after an ambiguous network failure: did the write land anyway? Candidates may read their
   * own submission only until it is graded, so "permission denied" also means "it arrived".
   */
  async hasSubmitted(sessionId: string): Promise<boolean> {
    try {
      const snap = await getDocFromServer(doc(this.#db, COLLECTIONS.submissions, sessionId));
      return snap.exists();
    } catch (error) {
      return error instanceof FirestoreError && error.code === 'permission-denied';
    }
  }

  /**
   * Live view of the candidate's released result. Emits `null` until the examiner's release
   * policy allows it — the score is not readable anywhere else.
   */
  watchResult(sessionId: string, next: (result: ExamResult | null) => void): Unsubscribe {
    return onSnapshot(
      doc(this.#db, COLLECTIONS.results, sessionId).withConverter(resultConverter),
      (snap) => next(snap.exists() ? snap.data() : null),
      () => next(null),
    );
  }
}
