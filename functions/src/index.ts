import { randomInt } from 'node:crypto';
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
  applyLayout,
  buildLayout,
  COLLECTIONS,
  deliveredQuestions,
  type DeliveryPolicy,
  type ExamSession,
  type ExamSessionStatus,
  finalizeScore,
  gradeAnswers,
  type IntegrityPolicy,
  isValidAccessCode,
  LIMITS,
  normalizeAccessCode,
  normalizeEmail,
  PAPER_DOC_ID,
  ROSTER_DOC_ID,
  type SessionLayout,
  sessionIdFor,
  type StartSessionRequest,
  type StartSessionResponse,
  toCanonicalAnswers,
} from './contracts';

initializeApp();
const db = getFirestore();

export { manageExaminerRole, refreshRole } from './roles';

/* ---------------------------------------------------------------------------------------------- */
/* startSession — the ONLY way an ExamSession comes into existence.                                */
/*                                                                                                 */
/* startedAt/expiresAt are minted from the server clock. Firestore rules forbid every client write */
/* to `sessions/*`, so the timer cannot be forged, extended, or reset. The call is idempotent: a   */
/* reconnecting candidate gets their existing session back (and a fresh serverNow for clock sync). */
/* It also enforces the exam lifecycle and roster, draws/shuffles this candidate's paper, and      */
/* freezes the exam's questions from the first start on.                                           */
/* ---------------------------------------------------------------------------------------------- */

export const startSession = onCall<StartSessionRequest, Promise<StartSessionResponse>>(
  async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'سجِّل الدخول قبل بدء الاختبار.');
    const { uid, token } = auth;

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
    const paperRef = examRef.collection(COLLECTIONS.paper).doc(PAPER_DOC_ID);
    const rosterRef = examRef.collection(COLLECTIONS.private).doc(ROSTER_DOC_ID);
    const sessionPaperRef = db.collection(COLLECTIONS.sessionPapers).doc(sessionRef.id);

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

      const status = exam['status'] ?? 'PUBLISHED';
      if (status === 'DRAFT') throw new HttpsError('failed-precondition', 'لم يُنشَر هذا الاختبار بعد.');
      if (status === 'CLOSED') throw new HttpsError('failed-precondition', 'أغلق المعلّم هذا الاختبار.');

      if (exam['access']?.mode === 'ROSTER') {
        const email = token.email_verified === true ? normalizeEmail(String(token.email ?? '')) : '';
        if (!email) {
          throw new HttpsError(
            'permission-denied',
            'هذا الاختبار مقصور على المدعوّين. سجِّل الدخول بالحساب الذي دُعيتَ به.',
          );
        }
        const roster = await tx.get(rosterRef);
        const emails = ((roster.get('emails') ?? []) as string[]).map(normalizeEmail);
        if (!emails.includes(email)) {
          throw new HttpsError('permission-denied', 'حسابك غير مدرج في قائمة المدعوّين لهذا الاختبار.');
        }
      }

      const opensAt = exam['window'].opensAt as Timestamp;
      const closesAt = exam['window'].closesAt as Timestamp;
      if (now.toMillis() < opensAt.toMillis()) {
        throw new HttpsError('failed-precondition', 'لم يُتَح هذا الاختبار بعد.');
      }
      if (now.toMillis() >= closesAt.toMillis()) {
        throw new HttpsError('failed-precondition', 'انتهت مدة إتاحة هذا الاختبار.');
      }

      // This candidate's paper: bank draw + shuffles, from a CSPRNG.
      const questions = readQuestions(await tx.get(paperRef));
      const layout = buildLayout(questions, exam['delivery'] as DeliveryPolicy | undefined, (n) =>
        randomInt(n),
      );

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
        candidateEmail: token.email ?? null,
        startedAt: now,
        expiresAt,
        status: 'ACTIVE' satisfies ExamSessionStatus,
        integrity: exam['integrity'] as IntegrityPolicy,
        submittedAt: null,
        questionCount: layout.questionIds.length,
        layout,
      };
      tx.create(sessionRef, data);
      tx.create(sessionPaperRef, {
        examOwnerId: exam['ownerId'],
        candidateId: uid,
        questions: applyLayout(questions, layout),
      });
      // Freeze the questions and key: edits after a candidate has started would be unfair.
      if (!exam['lockedAt']) tx.update(examRef, { lockedAt: now });
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
    const sessionRef = db.collection(COLLECTIONS.sessions).doc(event.params.sessionId);
    const [examSnap, paperSnap, keySnap, sessionSnap] = await Promise.all([
      examRef.get(),
      examRef.collection(COLLECTIONS.paper).doc(PAPER_DOC_ID).get(),
      examRef.collection(COLLECTIONS.private).doc(ANSWER_KEY_DOC_ID).get(),
      sessionRef.get(),
    ]);
    if (!examSnap.exists || !paperSnap.exists || !keySnap.exists) {
      logger.error('grade.missing-exam', { sessionId: event.params.sessionId });
      return;
    }

    // Map what the candidate saw back to the authored paper.
    const layout = (sessionSnap.get('layout') ?? null) as SessionLayout | null;
    const questions = deliveredQuestions(readQuestions(paperSnap), layout?.questionIds);
    const canonicalAnswers = toCanonicalAnswers(
      (submission['answers'] ?? {}) as Record<string, unknown>,
      layout,
    );
    const result = gradeAnswers(
      questions,
      keySnap.get('answers') as Record<string, number>,
      canonicalAnswers,
    );
    // Exams without written questions are final immediately; others wait for the examiner.
    const totals = finalizeScore(questions, result.score, {});

    const grading = {
      questionIds: questions.map((q) => q.id),
      canonicalAnswers,
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
    batch.update(sessionRef, {
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

/** Client-facing session. The layout (option permutations) stays on the server. */
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
    questionCount: data['questionCount'] ?? data['layout']?.questionIds?.length ?? 0,
  };
}
