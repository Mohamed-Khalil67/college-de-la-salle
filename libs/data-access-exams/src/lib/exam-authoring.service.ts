import { Service, inject } from '@angular/core';
import {
  ACCESS_CODE_ALPHABET,
  ANSWER_KEY_DOC_ID,
  COLLECTIONS,
  type AnswerKey,
  type ExamWindow,
  type IntegrityPolicy,
  LIMITS,
  PAPER_DOC_ID,
  type Question,
} from '@exam/contracts';
import {
  collection,
  doc,
  FirestoreError,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { FIRESTORE } from './firebase.providers';
import { AuthStore } from './auth.store';

export interface NewQuestionInput {
  readonly prompt: string;
  readonly options: readonly string[];
  readonly correctIndex: number;
  readonly points: number;
}

export interface NewExamInput {
  readonly title: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly window: ExamWindow;
  readonly integrity: IntegrityPolicy;
  readonly questions: readonly NewQuestionInput[];
}

export interface CreatedExam {
  readonly examId: string;
  readonly accessCode: string;
}

const MAX_CODE_ATTEMPTS = 4;

@Service()
export class ExamAuthoringService {
  readonly #db = inject(FIRESTORE);
  readonly #auth = inject(AuthStore);

  /**
   * Writes meta, paper, answer key and access code in ONE atomic batch, so a candidate can never
   * observe a half-created exam. A code collision is rejected by the rules (codes can only be
   * claimed once), in which case we retry with a fresh code.
   */
  async createExam(input: NewExamInput): Promise<CreatedExam> {
    const ownerId = this.#auth.uid();
    if (!ownerId || !this.#auth.isExaminer()) throw new Error('Sign in as an examiner first.');

    const questions: Question[] = input.questions.map((q, i) => ({
      id: `q${i + 1}`,
      prompt: q.prompt.trim(),
      options: q.options.map((o) => o.trim()),
      points: q.points,
    }));
    const answerKey: AnswerKey = Object.fromEntries(
      input.questions.map((q, i) => [`q${i + 1}`, q.correctIndex]),
    );
    const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
    const window = {
      opensAt: Timestamp.fromMillis(input.window.opensAt),
      closesAt: Timestamp.fromMillis(input.window.closesAt),
    };

    for (let attempt = 1; ; attempt++) {
      const examRef = doc(collection(this.#db, COLLECTIONS.exams));
      const accessCode = generateAccessCode();
      const batch = writeBatch(this.#db);

      batch.set(examRef, {
        ownerId,
        title: input.title.trim(),
        description: input.description.trim(),
        durationSeconds: input.durationSeconds,
        window,
        accessCode,
        integrity: input.integrity,
        questionCount: questions.length,
        maxScore,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(examRef, COLLECTIONS.paper, PAPER_DOC_ID), { ownerId, questions });
      batch.set(doc(examRef, COLLECTIONS.private, ANSWER_KEY_DOC_ID), { ownerId, answers: answerKey });
      batch.set(doc(this.#db, COLLECTIONS.accessCodes, accessCode), {
        code: accessCode,
        examId: examRef.id,
        ownerId,
        title: input.title.trim(),
        description: input.description.trim(),
        durationSeconds: input.durationSeconds,
        questionCount: questions.length,
        window,
      });

      try {
        await batch.commit();
        return { examId: examRef.id, accessCode };
      } catch (error) {
        const collision = error instanceof FirestoreError && error.code === 'permission-denied';
        if (!collision || attempt >= MAX_CODE_ATTEMPTS) throw error;
      }
    }
  }
}

export function generateAccessCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LIMITS.accessCodeLength));
  return Array.from(bytes, (b) => ACCESS_CODE_ALPHABET[b % ACCESS_CODE_ALPHABET.length]).join('');
}
