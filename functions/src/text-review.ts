import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { emulatorMockGrader, geminiGrader, type TextGrader } from './ai/text-grader';
import {
  ANSWER_KEY_DOC_ID,
  type AiSuggestion,
  buildAiGradePrompt,
  COLLECTIONS,
  finalizeScore,
  type GradeTextAnswerRequest,
  type GradeTextAnswerResponse,
  isValidManualPoints,
  LIMITS,
  PAPER_DOC_ID,
  type Question,
  type SuggestTextGradeRequest,
  type TextQuestion,
  type TextRubric,
} from './contracts';
import { readQuestions } from './exam-reads';

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
    const uid = requireExaminer(request);
    const { sessionId, questionId } = requireIds(request.data);
    const feedback = String(request.data?.feedback ?? '').trim().slice(0, LIMITS.maxFeedbackLength);
    const source = request.data?.source === 'AI_ACCEPTED' ? 'AI_ACCEPTED' : 'MANUAL';
    const db = getFirestore();
    const submissionRef = db.collection(COLLECTIONS.submissions).doc(sessionId);

    return db.runTransaction(async (tx) => {
      const submissionSnap = await tx.get(submissionRef);
      const submission = requireOwnedSubmission(submissionSnap, uid);
      if (!submission['gradingStatus']) {
        throw new HttpsError('failed-precondition', 'Automatic grading has not finished yet.');
      }

      const paperSnap = await tx.get(paperRef(submission['examId']));
      const questions = readQuestions(paperSnap);
      const question = requireTextQuestion(questions, questionId);

      const points = request.data?.points;
      if (!isValidManualPoints(points, question.points)) {
        throw new HttpsError(
          'invalid-argument',
          `Points must be between 0 and ${question.points}, in half-point steps.`,
        );
      }

      const manualScores = {
        ...(submission['manualScores'] ?? {}),
        [questionId]: { points, feedback, source, gradedBy: uid, gradedAt: Timestamp.now() },
      };
      const totals = finalizeScore(questions, submission['autoScore'] ?? 0, manualScores);

      tx.update(submissionRef, {
        [`manualScores.${questionId}`]: manualScores[questionId],
        pendingReview: totals.pendingReview,
        gradingStatus: totals.gradingStatus,
        score: totals.score,
        gradedAt: totals.gradingStatus === 'GRADED' ? FieldValue.serverTimestamp() : null,
      });

      logger.info('grade.manual', { sessionId, questionId, points, status: totals.gradingStatus });
      return { gradingStatus: totals.gradingStatus, score: totals.score };
    });
  },
);

/* ---------------------------------------------------------------------------------------------- */

export const suggestTextGrade = onCall<SuggestTextGradeRequest, Promise<AiSuggestion>>(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    const uid = requireExaminer(request);
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
      parsed = { points: 0, rationale: 'No answer was submitted for this question.' };
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

function selectGrader(): TextGrader {
  const key = GEMINI_API_KEY.value();
  if (key) return geminiGrader(key, GEMINI_MODEL.value());
  if (isEmulator) return emulatorMockGrader();
  throw new Error('AI grading is not configured: set the GEMINI_API_KEY secret.');
}

function requireExaminer(request: CallableRequest): string {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('permission-denied', 'Only examiners can grade.');
  }
  return auth.uid;
}

function requireIds(data: unknown): { sessionId: string; questionId: string } {
  const { sessionId, questionId } = (data ?? {}) as Record<string, unknown>;
  if (typeof sessionId !== 'string' || !sessionId || typeof questionId !== 'string' || !questionId) {
    throw new HttpsError('invalid-argument', 'sessionId and questionId are required.');
  }
  if (sessionId.includes('/') || questionId.includes('.') || questionId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Malformed id.');
  }
  return { sessionId, questionId };
}

function requireOwnedSubmission(
  snap: FirebaseFirestore.DocumentSnapshot,
  uid: string,
): FirebaseFirestore.DocumentData {
  // Same error for "missing" and "not yours": don't reveal which submissions exist.
  if (!snap.exists || snap.get('examOwnerId') !== uid) {
    throw new HttpsError('not-found', 'Submission not found.');
  }
  return snap.data()!;
}

function requireTextQuestion(questions: readonly Question[], questionId: string): TextQuestion {
  const question = questions.find((q) => q.id === questionId);
  if (!question || question.type !== 'TEXT') {
    throw new HttpsError('invalid-argument', 'That question is not a written-answer question.');
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
