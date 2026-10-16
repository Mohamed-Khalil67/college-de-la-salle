import {
  type AccessCodeRecord,
  type AiSuggestion,
  type AnswerKeyRecord,
  type ExamMeta,
  type ExamPaper,
  type ExamSession,
  type ManualGrade,
  normalizeQuestion,
  type Submission,
} from '@exam/contracts';
import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';

/**
 * Read-side converters: Firestore `Timestamp` → epoch millis, plus the document id.
 * Writes go through explicit payload builders (see `exam-authoring.service.ts`,
 * `exam-session.gateway.ts`) so every written field is visible next to the rule that guards it.
 */

const millis = (value: unknown): number => (value instanceof Timestamp ? value.toMillis() : 0);
const millisOrNull = (value: unknown): number | null =>
  value instanceof Timestamp ? value.toMillis() : null;

function mapValues<T>(
  map: DocumentData | undefined,
  fn: (value: DocumentData) => T,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(map ?? {}).map(([k, v]) => [k, fn(v as DocumentData)]),
  );
}

function readOnly<T>(fromFirestore: (id: string, data: DocumentData) => T): FirestoreDataConverter<T> {
  return {
    toFirestore: () => {
      throw new Error('Read-only converter: build write payloads explicitly.');
    },
    fromFirestore: (snap: QueryDocumentSnapshot) => fromFirestore(snap.id, snap.data()),
  };
}

export const examMetaConverter = readOnly<ExamMeta>((id, d) => ({
  id,
  ownerId: d['ownerId'],
  title: d['title'],
  description: d['description'],
  durationSeconds: d['durationSeconds'],
  window: { opensAt: millis(d['window']?.opensAt), closesAt: millis(d['window']?.closesAt) },
  accessCode: d['accessCode'],
  integrity: d['integrity'],
  questionCount: d['questionCount'],
  maxScore: d['maxScore'],
  // Pending server timestamps resolve to null in the local snapshot; fall back to "now-ish" order.
  createdAt: millisOrNull(d['createdAt']) ?? Number.MAX_SAFE_INTEGER,
}));

export const examPaperConverter = readOnly<ExamPaper>((_id, d) => ({
  ownerId: d['ownerId'],
  questions: (d['questions'] ?? []).map(normalizeQuestion),
}));

export const answerKeyConverter = readOnly<AnswerKeyRecord>((_id, d) => ({
  ownerId: d['ownerId'],
  answers: d['answers'] ?? {},
  rubrics: d['rubrics'] ?? {},
}));

export const accessCodeConverter = readOnly<AccessCodeRecord>((_id, d) => ({
  code: d['code'],
  examId: d['examId'],
  ownerId: d['ownerId'],
  title: d['title'],
  description: d['description'],
  durationSeconds: d['durationSeconds'],
  questionCount: d['questionCount'],
  window: { opensAt: millis(d['window']?.opensAt), closesAt: millis(d['window']?.closesAt) },
}));

export const sessionConverter = readOnly<ExamSession>((id, d) => ({
  id,
  examId: d['examId'],
  examOwnerId: d['examOwnerId'],
  examTitle: d['examTitle'],
  candidateId: d['candidateId'],
  candidateName: d['candidateName'],
  startedAt: millis(d['startedAt']),
  expiresAt: millis(d['expiresAt']),
  status: d['status'],
  integrity: d['integrity'],
  submittedAt: millisOrNull(d['submittedAt']),
}));

export const submissionConverter = readOnly<Submission>((id, d) => ({
  id,
  sessionId: d['sessionId'],
  examId: d['examId'],
  examOwnerId: d['examOwnerId'],
  candidateId: d['candidateId'],
  candidateName: d['candidateName'],
  answers: d['answers'] ?? {},
  integrity: d['integrity'] ?? { visibilityLossCount: 0, hiddenMs: 0 },
  completedBy: d['completedBy'],
  expiresAt: millis(d['expiresAt']),
  submittedAt: millis(d['submittedAt']),
  // Submissions graded before written questions existed have a score but no status.
  gradingStatus: d['gradingStatus'] ?? (typeof d['score'] === 'number' ? 'GRADED' : null),
  autoScore: typeof d['autoScore'] === 'number' ? d['autoScore'] : (d['score'] ?? null),
  manualScores: mapValues<ManualGrade>(d['manualScores'], (g) => ({
    points: g['points'],
    feedback: g['feedback'] ?? '',
    source: g['source'] ?? 'MANUAL',
    gradedBy: g['gradedBy'],
    gradedAt: millis(g['gradedAt']),
  })),
  aiSuggestions: mapValues<AiSuggestion>(d['aiSuggestions'], (s) => ({
    points: s['points'],
    rationale: s['rationale'] ?? '',
    model: s['model'] ?? '',
    createdAt: millis(s['createdAt']),
  })),
  pendingReview: d['pendingReview'] ?? [],
  score: typeof d['score'] === 'number' ? d['score'] : null,
  maxScore: typeof d['maxScore'] === 'number' ? d['maxScore'] : null,
  gradedAt: millisOrNull(d['gradedAt']),
}));
