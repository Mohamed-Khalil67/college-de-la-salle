import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, computed, inject } from '@angular/core';
import { COLLECTIONS } from '@exam/contracts';
import { FIRESTORE, firestoreQueryResource } from '@exam/data-access-auth/data';
import {
  collection,
  type FirestoreDataConverter,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  where,
} from 'firebase/firestore';
import { isSubjectId, type PracticeExamCard, type SubjectId } from './curriculum.model';

const MAX_CARDS = 24;

const practiceConverter: FirestoreDataConverter<PracticeExamCard | null> = {
  toFirestore: () => {
    throw new Error('The practice catalog is written by the exam authoring service.');
  },
  fromFirestore: (snap: QueryDocumentSnapshot): PracticeExamCard | null => {
    const d = snap.data();
    const subjectId = d['subjectId'];
    if (!isSubjectId(subjectId) || typeof d['title'] !== 'string' || typeof d['code'] !== 'string') return null;
    return {
      examId: snap.id,
      subjectId,
      title: d['title'],
      code: d['code'],
      durationSeconds: typeof d['durationSeconds'] === 'number' ? d['durationSeconds'] : 0,
      questionCount: typeof d['questionCount'] === 'number' ? d['questionCount'] : 0,
    };
  },
};

/**
 * Practice exams examiners listed publicly for one subject (readable without signing in).
 * Call in an injection context (a component field initializer).
 *
 * Browser-only: on the server the list is empty, so prerendered HTML never contains stale codes,
 * and the live list streams in after hydration.
 */
export function injectPracticeCatalog(subjectId: () => SubjectId | null) {
  const db = inject(FIRESTORE);
  const browser = isPlatformBrowser(inject(PLATFORM_ID));

  const cards = firestoreQueryResource({
    params: () => (browser ? (subjectId() ?? undefined) : undefined),
    query: (id: SubjectId) =>
      query(
        collection(db, COLLECTIONS.practiceCatalog).withConverter(practiceConverter),
        where('subjectId', '==', id),
        orderBy('publishedAt', 'desc'),
        limit(MAX_CARDS),
      ),
  });

  return {
    exams: computed(() => cards.value().filter((c): c is PracticeExamCard => c !== null)),
    loading: computed(() => browser && cards.isLoading()),
    error: computed(() => cards.error() ?? null),
  };
}