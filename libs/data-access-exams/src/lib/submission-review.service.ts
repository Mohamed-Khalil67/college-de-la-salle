import { Service, inject } from '@angular/core';
import {
  ANSWER_KEY_DOC_ID,
  type AiSuggestion,
  type AnswerKeyRecord,
  COLLECTIONS,
  type ExamPaper,
  type GradeTextAnswerRequest,
  type GradeTextAnswerResponse,
  PAPER_DOC_ID,
  type SuggestTextGradeRequest,
} from '@exam/contracts';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FIREBASE_FUNCTIONS, FIRESTORE } from './firebase.providers';
import { answerKeyConverter, examPaperConverter } from './firestore-converters';

export interface ExamGradingContext {
  readonly paper: ExamPaper;
  readonly key: AnswerKeyRecord;
}

/**
 * Examiner-side grading I/O. Reads use the owner's Firestore access; every grade change goes
 * through a Cloud Function, because submissions are immutable to all clients.
 */
@Service()
export class SubmissionReviewService {
  readonly #db = inject(FIRESTORE);
  readonly #functions = inject(FIREBASE_FUNCTIONS);

  /** Paper + answer key/rubrics. Readable only by the exam owner (rules). */
  async loadGradingContext(examId: string): Promise<ExamGradingContext> {
    const examRef = doc(this.#db, COLLECTIONS.exams, examId);
    const [paperSnap, keySnap] = await Promise.all([
      getDoc(doc(examRef, COLLECTIONS.paper, PAPER_DOC_ID).withConverter(examPaperConverter)),
      getDoc(doc(examRef, COLLECTIONS.private, ANSWER_KEY_DOC_ID).withConverter(answerKeyConverter)),
    ]);
    if (!paperSnap.exists() || !keySnap.exists()) throw new Error('Exam content is missing.');
    return { paper: paperSnap.data(), key: keySnap.data() };
  }

  async gradeTextAnswer(request: GradeTextAnswerRequest): Promise<GradeTextAnswerResponse> {
    const call = httpsCallable<GradeTextAnswerRequest, GradeTextAnswerResponse>(
      this.#functions,
      'gradeTextAnswer',
    );
    return (await call(request)).data;
  }

  async suggestTextGrade(request: SuggestTextGradeRequest): Promise<AiSuggestion> {
    const call = httpsCallable<SuggestTextGradeRequest, AiSuggestion>(
      this.#functions,
      'suggestTextGrade',
      { timeout: 70_000 },
    );
    return (await call(request)).data;
  }
}
