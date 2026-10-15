import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import {
  COLLECTIONS,
  type EpochMillis,
  type ExamMeta,
  type ExamSession,
  type Submission,
} from '@exam/contracts';
import { collection, query, where } from 'firebase/firestore';
import { AuthStore } from './auth.store';
import { FIRESTORE } from './firebase.providers';
import { examMetaConverter, sessionConverter, submissionConverter } from './firestore-converters';
import { firestoreQueryResource } from './firestore-resource';
import { injectServerNow } from './server-clock';

export type CandidateRowStatus = 'IN_PROGRESS' | 'GRADING' | 'GRADED' | 'EXPIRED';

export interface CandidateRow {
  readonly sessionId: string;
  readonly candidateName: string;
  readonly status: CandidateRowStatus;
  readonly startedAt: EpochMillis;
  readonly expiresAt: EpochMillis;
  readonly remainingMs: number;
  readonly submission: Submission | null;
}

/**
 * Live examiner view. Every query is scoped to `examOwnerId == uid`, which is both what the rules
 * demand and what makes the listener legal. Provide it at the feature route/component level.
 */
@Injectable()
export class ExaminerDashboardStore {
  readonly #db = inject(FIRESTORE);
  readonly #auth = inject(AuthStore);
  readonly #now = injectServerNow(1_000);

  readonly #exams = firestoreQueryResource<ExamMeta, string>({
    params: () => this.#auth.uid() ?? undefined,
    query: (uid) =>
      query(
        collection(this.#db, COLLECTIONS.exams).withConverter(examMetaConverter),
        where('ownerId', '==', uid),
      ),
  });

  readonly exams = computed(() =>
    [...this.#exams.value()].sort((a, b) => b.createdAt - a.createdAt),
  );

  /** Follows the newest exam until the examiner picks one; keeps that pick while it still exists. */
  readonly selectedExamId = linkedSignal<readonly ExamMeta[], string | null>({
    source: this.exams,
    computation: (exams, previous) =>
      previous?.value && exams.some((e) => e.id === previous.value)
        ? previous.value
        : (exams[0]?.id ?? null),
  });

  readonly #scope = computed(() => {
    const uid = this.#auth.uid();
    const examId = this.selectedExamId();
    return uid && examId ? { uid, examId } : undefined;
  });

  readonly #sessions = firestoreQueryResource<ExamSession, { uid: string; examId: string }>({
    params: () => this.#scope(),
    query: ({ uid, examId }) =>
      query(
        collection(this.#db, COLLECTIONS.sessions).withConverter(sessionConverter),
        where('examOwnerId', '==', uid),
        where('examId', '==', examId),
      ),
  });

  readonly #submissions = firestoreQueryResource<Submission, { uid: string; examId: string }>({
    params: () => this.#scope(),
    query: ({ uid, examId }) =>
      query(
        collection(this.#db, COLLECTIONS.submissions).withConverter(submissionConverter),
        where('examOwnerId', '==', uid),
        where('examId', '==', examId),
      ),
  });

  readonly examsLoading = this.#exams.isLoading;
  readonly error = computed(
    () => this.#exams.error() ?? this.#sessions.error() ?? this.#submissions.error() ?? null,
  );

  readonly selectedExam = computed(
    () => this.exams().find((e) => e.id === this.selectedExamId()) ?? null,
  );

  readonly rows = computed<readonly CandidateRow[]>(() => {
    const now = this.#now();
    const submissions = new Map(this.#submissions.value().map((s) => [s.id, s]));
    return this.#sessions
      .value()
      .map((session) => toRow(session, submissions.get(session.id) ?? null, now))
      .sort((a, b) => b.startedAt - a.startedAt);
  });

  readonly stats = computed(() => {
    const rows = this.rows();
    const graded = rows.filter((r) => r.status === 'GRADED');
    const avg = graded.length
      ? graded.reduce((sum, r) => sum + (r.submission!.score ?? 0), 0) / graded.length
      : null;
    return {
      inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
      graded: graded.length,
      expired: rows.filter((r) => r.status === 'EXPIRED').length,
      averageScore: avg,
    };
  });
}

/** Pure derivation of the dashboard status; exported for tests. */
export function toRow(
  session: ExamSession,
  submission: Submission | null,
  now: EpochMillis,
): CandidateRow {
  let status: CandidateRowStatus;
  if (submission) {
    status = submission.score === null ? 'GRADING' : 'GRADED';
  } else if (session.status === 'ACTIVE' && now < session.expiresAt) {
    status = 'IN_PROGRESS';
  } else {
    status = 'EXPIRED';
  }
  return {
    sessionId: session.id,
    candidateName: session.candidateName,
    status,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    remainingMs: Math.max(0, session.expiresAt - now),
    submission,
  };
}
