import {
  type DocumentData,
  type DocumentReference,
  getFirestore,
  Timestamp,
  type Transaction,
  type WriteBatch,
} from 'firebase-admin/firestore';
import {
  buildResult,
  COLLECTIONS,
  draftToSubmission,
  type ExamSessionStatus,
  isResultReleased,
  type ManualGrade,
  type Question,
  type ScoringPolicy,
} from './contracts';

/*
 * Session close-out and result publishing, shared by the triggers and callables.
 */

/**
 * Closes an ACTIVE session whose deadline has passed. If the candidate's device never submitted
 * but autosaved a draft, that draft becomes their submission (`completedBy: SERVER_DRAFT`) and is
 * graded like any other. Must be called inside a transaction before any of its writes.
 */
export async function finalizeExpiredSession(
  tx: Transaction,
  sessionRef: DocumentReference,
  session: DocumentData,
): Promise<ExamSessionStatus> {
  const db = getFirestore();
  const submissionRef = db.collection(COLLECTIONS.submissions).doc(sessionRef.id);
  const draftRef = db.collection(COLLECTIONS.drafts).doc(sessionRef.id);
  const [submissionSnap, draftSnap] = await Promise.all([tx.get(submissionRef), tx.get(draftRef)]);

  if (submissionSnap.exists) return 'SUBMITTED'; // the grader will (or did) close the session

  const submission = draftToSubmission(
    {
      id: sessionRef.id,
      examId: session['examId'],
      examOwnerId: session['examOwnerId'],
      candidateId: session['candidateId'],
      candidateName: session['candidateName'],
      expiresAt: (session['expiresAt'] as Timestamp).toMillis(),
    },
    draftSnap.exists ? (draftSnap.data() as Parameters<typeof draftToSubmission>[1]) : null,
  );

  if (!submission) {
    tx.update(sessionRef, { status: 'EXPIRED' satisfies ExamSessionStatus });
    return 'EXPIRED';
  }

  tx.create(submissionRef, {
    ...submission,
    expiresAt: session['expiresAt'],
    // The completion time is the last moment the server received the candidate's work.
    submittedAt: draftSnap.get('updatedAt') ?? session['expiresAt'],
  });
  tx.update(sessionRef, {
    status: 'SUBMITTED' satisfies ExamSessionStatus,
    submittedAt: draftSnap.get('updatedAt') ?? session['expiresAt'],
  });
  return 'SUBMITTED';
}

export interface ExamForResults {
  readonly title: string;
  readonly scoring: ScoringPolicy | undefined;
  readonly resultsPublished: boolean | undefined;
}

export function examForResults(exam: DocumentData): ExamForResults {
  return {
    title: exam['title'],
    scoring: exam['scoring'],
    resultsPublished: exam['resultsPublished'],
  };
}

/**
 * Writes (or refreshes) the candidate-visible result when the release policy allows it. Called
 * whenever a submission's grade may have changed. Returns whether a result was written.
 */
export function writeResultIfReleased(
  writer: Transaction | WriteBatch,
  sessionId: string,
  submission: DocumentData,
  exam: ExamForResults,
  questions: readonly Question[],
  force = false,
): boolean {
  const released =
    force || isResultReleased(exam.scoring, exam.resultsPublished, submission['gradingStatus']);
  if (!released || submission['gradingStatus'] !== 'GRADED') return false;

  const result = buildResult(
    {
      sessionId,
      examId: submission['examId'],
      examOwnerId: submission['examOwnerId'],
      examTitle: exam.title,
      candidateId: submission['candidateId'],
      candidateName: submission['candidateName'],
      score: submission['score'],
      maxScore: submission['maxScore'],
      scoring: exam.scoring,
      questions,
      manualScores: (submission['manualScores'] ?? {}) as Record<string, ManualGrade>,
    },
    Date.now(),
  );

  const ref = getFirestore().collection(COLLECTIONS.results).doc(sessionId);
  const data = { ...result, publishedAt: Timestamp.fromMillis(result.publishedAt) };
  (writer as WriteBatch).set(ref, data);
  return true;
}
