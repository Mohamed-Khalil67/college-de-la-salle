import { Service, inject } from '@angular/core';
import {
  type AccessCodeRecord,
  COLLECTIONS,
  type ExamPaper,
  normalizeAccessCode,
  PAPER_DOC_ID,
  type StartSessionRequest,
  type StartSessionResponse,
  type SubmissionDraft,
} from '@exam/contracts';
import { doc, getDoc, getDocFromServer, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AuthStore } from './auth.store';
import { FIREBASE_FUNCTIONS, FIRESTORE } from './firebase.providers';
import { accessCodeConverter, examPaperConverter } from './firestore-converters';
import { ServerClock } from './server-clock';

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
    if (!snap.exists()) throw new Error('The question paper is unavailable.');
    return snap.data();
  }

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

  /** Used after an ambiguous network failure: did the write land anyway? */
  async hasSubmitted(sessionId: string): Promise<boolean> {
    try {
      const snap = await getDocFromServer(doc(this.#db, COLLECTIONS.submissions, sessionId));
      return snap.exists();
    } catch {
      return false;
    }
  }
}
