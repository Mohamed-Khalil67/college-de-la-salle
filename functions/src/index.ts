import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { readQuestions } from './exam-reads';
import { examForResults, finalizeExpiredSession, writeResultIfReleased } from './lifecycle';
import {
  ANSWER_KEY_DOC_ID,
  COLLECTIONS,
  type ExamSession,
  type ExamSessionStatus,
  finalizeScore,
  gradeAnswers,
  type IntegrityPolicy,
  isValidAccessCode,
  LIMITS,
  normalizeAccessCode,
  PAPER_DOC_ID,
  sessionIdFor,
  type StartSessionRequest,
  type StartSessionResponse,
} from './contracts';

initializeApp();
const db = getFirestore();

/* ---------------------------------------------------------------------------------------------- */
/* startSession — the ONLY way an ExamSession comes into existence.                                */
/*                                                                                                 */
/* startedAt/expiresAt are minted from the server clock. Firestore rules forbid every client write */
/* to `sessions/*`, so the timer cannot be forged, extended, or reset. The call is idempotent: a   */
/* reconnecting candidate gets their existing session back (and a fresh serverNow for clock sync). */
/* ---------------------------------------------------------------------------------------------- */

export const startSession = onCall<StartSessionRequest, Promise<StartSessionResponse>>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'سجِّل الدخول قبل بدء الاختبار.');

    const code = normalizeAccessCode(String(request.data?.accessCode ?? ''));
    if (!isValidAccessCode(code)) throw new HttpsError('invalid-argument', 'رمز الاختبار غير صالح.');

    const candidateName = String(request.data?.candidateName ?? '')
      .trim()
      .slice(0, LIMITS.maxCandidateNameLength);
    if (!candidateName) throw new HttpsError('invalid-argument', 'الاسم مطلوب.');

    const codeSnap = await db.collection(COLLECTIONS.accessCodes).doc(code).get();
    if (!codeSnap.exists) throw new HttpsError('not-found', 'لا يوجد اختبار بهذا الرمز.');
    const examId = codeSnap.get('examId') as string;

    const examRef = db.collection(COLLECTIONS.exams).doc(examId);
    const sessionRef = db.collection(COLLECTIONS.sessions).doc(sessionIdFor(examId, uid));

    const session = await db.runTransaction(async (tx) => {
      const [examSnap, existing] = await Promise.all([tx.get(examRef), tx.get(sessionRef)]);
      const now = Timestamp.now();

      if (existing.exists) {
        const current = toSession(existing.id, existing.data()!);
        if (current.status === 'ACTIVE' && current.expiresAt <= now.toMillis()) {
          // The device never submitted: close the session, finalising the autosaved draft if any.
          const status = await finalizeExpiredSession(tx, sessionRef, existing.data()!);
          return { ...current, status };
        }
        return current;
      }

      if (!examSnap.exists) throw new HttpsError('not-found', 'لم يعد هذا الاختبار موجودًا.');
      const exam = examSnap.data()!;
      const opensAt = exam['window'].opensAt as Timestamp;
      const closesAt = exam['window'].closesAt as Timestamp;

      if (now.toMillis() < opensAt.toMillis()) {
        throw new HttpsError('failed-precondition', 'لم يُتَح هذا الاختبار بعد.');
      }
      if (now.toMillis() >= closesAt.toMillis()) {
        throw new HttpsError('failed-precondition', 'انتهت مدة إتاحة هذا الاختبار.');
      }

      // The exam window is a hard stop: a late starter gets less time, never more.
      const expiresAt = Timestamp.fromMillis(
        Math.min(now.toMillis() + (exam['durationSeconds'] as number) * 1000, closesAt.toMillis()),
      );

      const data = {
        examId,
        examOwnerId: exam['ownerId'] as string,
        examTitle: exam['title'] as string,
        candidateId: uid,
        candidateName,
        startedAt: now,
        expiresAt,
        status: 'ACTIVE' satisfies ExamSessionStatus,
        integrity: exam['integrity'] as IntegrityPolicy,
        submittedAt: null,
      };
      tx.create(sessionRef, data);
      return toSession(sessionRef.id, data);
    });

    logger.info('session.start', { sessionId: session.id, status: session.status });
    return { session, serverNow: Date.now() };
  },
);

/* ---------------------------------------------------------------------------------------------- */
/* gradeSubmission — server-side grading against the private answer key.                           */
/* ---------------------------------------------------------------------------------------------- */

export const gradeSubmission = onDocumentCreated(
  `${COLLECTIONS.submissions}/{sessionId}`,
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const submission = snap.data();

    // Triggers are at-least-once; grading is idempotent.
    if (submission['gradingStatus']) return;

    const examRef = db.collection(COLLECTIONS.exams).doc(submission['examId'] as string);
    const [examSnap, paperSnap, keySnap] = await Promise.all([
      examRef.get(),
      examRef.collection(COLLECTIONS.paper).doc(PAPER_DOC_ID).get(),
      examRef.collection(COLLECTIONS.private).doc(ANSWER_KEY_DOC_ID).get(),
    ]);
    if (!examSnap.exists || !paperSnap.exists || !keySnap.exists) {
      logger.error('grade.missing-exam', { sessionId: event.params.sessionId });
      return;
    }

    const questions = readQuestions(paperSnap);
    const result = gradeAnswers(
      questions,
      keySnap.get('answers') as Record<string, number>,
      (submission['answers'] ?? {}) as Record<string, unknown>,
    );
    // Exams without written questions are final immediately; others wait for the examiner.
    const totals = finalizeScore(questions, result.score, {});

    const grading = {
      autoScore: result.score,
      maxScore: result.maxScore,
      correctCount: result.correctCount,
      manualScores: {},
      aiSuggestions: {},
      pendingReview: totals.pendingReview,
      gradingStatus: totals.gradingStatus,
      score: totals.score,
      gradedAt: totals.gradingStatus === 'GRADED' ? FieldValue.serverTimestamp() : null,
    };
    const batch = db.batch();
    batch.update(snap.ref, grading);
    // Auto-graded exams with ON_GRADED release: the candidate sees the result immediately.
    writeResultIfReleased(
      batch,
      event.params.sessionId,
      { ...submission, ...grading },
      examForResults(examSnap.data()!),
      questions,
    );
    batch.update(db.collection(COLLECTIONS.sessions).doc(event.params.sessionId), {
      status: 'SUBMITTED' satisfies ExamSessionStatus,
      submittedAt: submission['submittedAt'],
    });
    await batch.commit();
    logger.info('grade.done', { sessionId: event.params.sessionId, ...result });
  },
);

/* ---------------------------------------------------------------------------------------------- */
/* sweepExpiredSessions — closes out sessions whose candidates vanished without submitting, turning */
/* their last autosaved draft into a submission. Rules already reject late client writes.         */
/* ---------------------------------------------------------------------------------------------- */

export { gradeTextAnswer, publishResults, suggestTextGrade } from './text-review';

export const sweepExpiredSessions = onSchedule('every 5 minutes', async () => {
  const expired = await db
    .collection(COLLECTIONS.sessions)
    .where('status', '==', 'ACTIVE' satisfies ExamSessionStatus)
    .where('expiresAt', '<', Timestamp.now())
    .limit(400)
    .get();

  let finalized = 0;
  for (const docSnap of expired.docs) {
    const status = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(docSnap.ref);
      if (fresh.get('status') !== 'ACTIVE') return fresh.get('status') as ExamSessionStatus;
      return finalizeExpiredSession(tx, docSnap.ref, fresh.data()!);
    });
    if (status === 'SUBMITTED') finalized++;
  }
  logger.info('session.sweep', { closed: expired.size, finalizedFromDraft: finalized });
});

/* ---------------------------------------------------------------------------------------------- */

function toSession(id: string, data: FirebaseFirestore.DocumentData): ExamSession {
  return {
    id,
    examId: data['examId'],
    examOwnerId: data['examOwnerId'],
    examTitle: data['examTitle'],
    candidateId: data['candidateId'],
    candidateName: data['candidateName'],
    startedAt: (data['startedAt'] as Timestamp).toMillis(),
    expiresAt: (data['expiresAt'] as Timestamp).toMillis(),
    status: data['status'],
    integrity: data['integrity'],
    submittedAt: data['submittedAt'] ? (data['submittedAt'] as Timestamp).toMillis() : null,
  };
}
