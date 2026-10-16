import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { emulatorMockGrader, geminiGrader, type TextGrader } from './ai/text-grader';
import {
  ANSWER_KEY_DOC_ID,
  type AiSuggestion,
  buildAiGradePrompt,
  COLLECTIONS,
  deliveredQuestions,
  finalizeScore,
  type GradeTextAnswerRequest,
  type GradeTextAnswerResponse,
  type PublishResultsRequest,
  type PublishResultsResponse,
  isValidManualPoints,
  LIMITS,
  PAPER_DOC_ID,
  type Question,
  type SuggestTextGradeRequest,
  type TextQuestion,
  type TextRubric,
} from './contracts';
import { requireAuthor } from './roles';
import { readQuestions } from './exam-reads';
import { examForResults, writeResultIfReleased } from './lifecycle';

/*
 * Written-answer review. Both callables are examiner-only and verify ownership server-side:
 * submissions are immutable to every client (see firestore.rules), so these are the ONLY paths
 * that can change a grade. An AI suggestion is stored separately and never alters the score.
 */

/** Free key from https://aistudio.google.com/apikey — `firebase functions:secrets:set GEMINI_API_KEY`. */
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
/** `gemini-flash-latest` tracks Google's current free-tier Flash model. Override per project. */
const GEMINI_MODEL = defineString('GEMINI_MODEL', { default: 'gemini-flash-latest' });

const isEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';

/* ---------------------------------------------------------------------------------------------- */

export const gradeTextAnswer = onCall<GradeTextAnswerRequest, Promise<GradeTextAnswerResponse>>(
  async (request) => {
    const uid = await requireAuthor(request);
    const { sessionId, questionId } = requireIds(request.data);
    const feedback = String(request.data?.feedback ?? '').trim().slice(0, LIMITS.maxFeedbackLength);
    const source = request.data?.source === 'AI_ACCEPTED' ? 'AI_ACCEPTED' : 'MANUAL';
    const db = getFirestore();
    const submissionRef = db.collection(COLLECTIONS.submissions).doc(sessionId);

    return db.runTransaction(async (tx) => {
      const submissionSnap = await tx.get(submissionRef);
      const submission = requireOwnedSubmission(submissionSnap, uid);
      if (!submission['gradingStatus']) {
        throw new HttpsError('failed-precondition', 'لم يكتمل التصحيح الآلي بعد.');
      }

      const [paperSnap, examSnap] = await Promise.all([
        tx.get(paperRef(submission['examId'])),
        tx.get(db.collection(COLLECTIONS.exams).doc(submission['examId'])),
      ]);
      // Only the questions this candidate actually received count towards their total.
      const questions = deliveredQuestions(readQuestions(paperSnap), submission['questionIds']);
      const question = requireTextQuestion(questions, questionId);

      const points = request.data?.points;
      if (!isValidManualPoints(points, question.points)) {
        throw new HttpsError(
          'invalid-argument',
          `يجب أن تكون الدرجة بين ٠ و${question.points}، بدرجات صحيحة أو أنصاف درجات.`,
        );
      }

      const manualScores = {
        ...(submission['manualScores'] ?? {}),
        [questionId]: { points, feedback, source, gradedBy: uid, gradedAt: Timestamp.now() },
      };
      const totals = finalizeScore(questions, submission['autoScore'] ?? 0, manualScores);

      const update = {
        pendingReview: totals.pendingReview,
        gradingStatus: totals.gradingStatus,
        score: totals.score,
        gradedAt: totals.gradingStatus === 'GRADED' ? FieldValue.serverTimestamp() : null,
      };
      tx.update(submissionRef, { [`manualScores.${questionId}`]: manualScores[questionId], ...update });
      // Final grade (or a re-grade of an already released result): refresh what the candidate sees.
      if (examSnap.exists) {
        writeResultIfReleased(
          tx,
          sessionId,
          { ...submission, ...update, manualScores },
          examForResults(examSnap.data()!),
          questions,
        );
      }

      logger.info('grade.manual', { sessionId, questionId, points, status: totals.gradingStatus });
      return { gradingStatus: totals.gradingStatus, score: totals.score };
    });
  },
);

/* ---------------------------------------------------------------------------------------------- */

export const suggestTextGrade = onCall<SuggestTextGradeRequest, Promise<AiSuggestion>>(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    const uid = await requireAuthor(request);
    const { sessionId, questionId } = requireIds(request.data);
    const db = getFirestore();
    const submissionRef = db.collection(COLLECTIONS.submissions).doc(sessionId);

    const submission = requireOwnedSubmission(await submissionRef.get(), uid);
    const examRef = db.collection(COLLECTIONS.exams).doc(submission['examId']);
    const [paperSnap, keySnap] = await Promise.all([
      paperRef(submission['examId']).get(),
      examRef.collection(COLLECTIONS.private).doc(ANSWER_KEY_DOC_ID).get(),
    ]);
    const question = requireTextQuestion(readQuestions(paperSnap), questionId);
    const rubric = (keySnap.get('rubrics') ?? {})[questionId] as TextRubric | undefined;
    const answer = submission['answers']?.[questionId];

    let grader: TextGrader;
    try {
      grader = selectGrader();
    } catch (error) {
      throw new HttpsError('failed-precondition', (error as Error).message);
    }

    let parsed;
    if (typeof answer !== 'string' || !answer.trim()) {
      parsed = { points: 0, rationale: 'لم تُقدَّم إجابة عن هذا السؤال.' };
    } else {
      try {
        parsed = await grader.grade(buildAiGradePrompt(question, rubric, answer), question.points);
      } catch (error) {
        throw new HttpsError('unavailable', (error as Error).message);
      }
    }

    const createdAt = Timestamp.now();
    await submissionRef.update({
      [`aiSuggestions.${questionId}`]: { ...parsed, model: grader.model, createdAt },
    });
    logger.info('grade.ai-suggestion', { sessionId, questionId, model: grader.model });
    return { ...parsed, model: grader.model, createdAt: createdAt.toMillis() };
  },
);

/* ---------------------------------------------------------------------------------------------- */

/**
 * Examiner-only. Marks an exam's results as published and writes a result for every graded
 * submission. Submissions graded later are published as they complete (see writeResultIfReleased).
 */
export const publishResults = onCall<PublishResultsRequest, Promise<PublishResultsResponse>>(
  async (request) => {
    const uid = await requireAuthor(request);
    const examId = String(request.data?.examId ?? '');
    if (!examId || examId.includes('/')) throw new HttpsError('invalid-argument', 'معرِّف الاختبار غير صالح.');
    const db = getFirestore();
    const examRef = db.collection(COLLECTIONS.exams).doc(examId);

    const examSnap = await examRef.get();
    if (!examSnap.exists || examSnap.get('ownerId') !== uid) {
      throw new HttpsError('not-found', 'لم يُعثَر على الاختبار.');
    }
    const [paperSnap, graded] = await Promise.all([
      paperRef(examId).get(),
      db
        .collection(COLLECTIONS.submissions)
        .where('examOwnerId', '==', uid)
        .where('examId', '==', examId)
        .where('gradingStatus', '==', 'GRADED')
        .get(),
    ]);
    const questions = readQuestions(paperSnap);
    const exam = { ...examForResults(examSnap.data()!), resultsPublished: true };

    const batch = db.batch();
    batch.update(examRef, { resultsPublished: true });
    let published = 0;
    for (const sub of graded.docs) {
      const delivered = deliveredQuestions(questions, sub.get('questionIds'));
      if (writeResultIfReleased(batch, sub.id, sub.data(), exam, delivered)) published++;
    }
    await batch.commit();
    logger.info('results.published', { examId, published });
    return { published };
  },
);
/* ---------------------------------------------------------------------------------------------- */

function selectGrader(): TextGrader {
  const key = GEMINI_API_KEY.value();
  if (key) return geminiGrader(key, GEMINI_MODEL.value());
  if (isEmulator) return emulatorMockGrader();
  throw new Error('التصحيح بالذكاء الاصطناعي غير مُهيَّأ: اضبط المفتاح السرّي GEMINI_API_KEY.');
}

function requireIds(data: unknown): { sessionId: string; questionId: string } {
  const { sessionId, questionId } = (data ?? {}) as Record<string, unknown>;
  if (typeof sessionId !== 'string' || !sessionId || typeof questionId !== 'string' || !questionId) {
    throw new HttpsError('invalid-argument', 'معرِّف الجلسة ومعرِّف السؤال مطلوبان.');
  }
  if (sessionId.includes('/') || questionId.includes('.') || questionId.includes('/')) {
    throw new HttpsError('invalid-argument', 'معرِّف غير صالح.');
  }
  return { sessionId, questionId };
}

function requireOwnedSubmission(
  snap: FirebaseFirestore.DocumentSnapshot,
  uid: string,
): FirebaseFirestore.DocumentData {
  // Same error for "missing" and "not yours": don't reveal which submissions exist.
  if (!snap.exists || snap.get('examOwnerId') !== uid) {
    throw new HttpsError('not-found', 'لم يُعثَر على الإجابات المطلوبة.');
  }
  return snap.data()!;
}

function requireTextQuestion(questions: readonly Question[], questionId: string): TextQuestion {
  const question = questions.find((q) => q.id === questionId);
  if (!question || question.type !== 'TEXT') {
    throw new HttpsError('invalid-argument', 'هذا السؤال ليس سؤالًا مقاليًّا.');
  }
  return question;
}

function paperRef(examId: string) {
  return getFirestore()
    .collection(COLLECTIONS.exams)
    .doc(examId)
    .collection(COLLECTIONS.paper)
    .doc(PAPER_DOC_ID);
}
