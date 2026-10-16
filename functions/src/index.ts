import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { readQuestions } from './exam-reads';
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
          tx.update(sessionRef, { status: 'EXPIRED' satisfies ExamSessionStatus });
          return { ...current, status: 'EXPIRED' as const };
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
    const [paperSnap, keySnap] = await Promise.all([
      examRef.collection(COLLECTIONS.paper).doc(PAPER_DOC_ID).get(),
      examRef.collection(COLLECTIONS.private).doc(ANSWER_KEY_DOC_ID).get(),
    ]);
    if (!paperSnap.exists || !keySnap.exists) {
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

    const batch = db.batch();
    batch.update(snap.ref, {
      autoScore: result.score,
      maxScore: result.maxScore,
      correctCount: result.correctCount,
      manualScores: {},
      aiSuggestions: {},
      pendingReview: totals.pendingReview,
      gradingStatus: totals.gradingStatus,
      score: totals.score,
      gradedAt: totals.gradingStatus === 'GRADED' ? FieldValue.serverTimestamp() : null,
    });
    batch.update(db.collection(COLLECTIONS.sessions).doc(event.params.sessionId), {
      status: 'SUBMITTED' satisfies ExamSessionStatus,
      submittedAt: submission['submittedAt'],
    });
    await batch.commit();
    logger.info('grade.done', { sessionId: event.params.sessionId, ...result });
  },
);

/* ---------------------------------------------------------------------------------------------- */
/* sweepExpiredSessions — closes out sessions whose candidates vanished without submitting.        */
/* (Correctness never depends on this: rules already reject late writes. It keeps status honest.)  */
/* ---------------------------------------------------------------------------------------------- */

export { gradeTextAnswer, suggestTextGrade } from './text-review';

export const sweepExpiredSessions = onSchedule('every 5 minutes', async () => {
  const expired = await db
    .collection(COLLECTIONS.sessions)
    .where('status', '==', 'ACTIVE' satisfies ExamSessionStatus)
    .where('expiresAt', '<', Timestamp.now())
    .limit(400)
    .get();

  if (expired.empty) return;
  const batch = db.batch();
  for (const docSnap of expired.docs) {
    batch.update(docSnap.ref, { status: 'EXPIRED' satisfies ExamSessionStatus });
  }
  await batch.commit();
  logger.info('session.sweep', { expired: expired.size });
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
