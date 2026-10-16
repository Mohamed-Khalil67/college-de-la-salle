import { Service, inject } from '@angular/core';
import {
  ACCESS_CODE_ALPHABET,
  type AccessPolicy,
  ANSWER_KEY_DOC_ID,
  type AnswerKeyRecord,
  COLLECTIONS,
  type DeliveryPolicy,
  type ExamMeta,
  type ExamPaper,
  type ExamStatus,
  type ExamWindow,
  type IntegrityPolicy,
  invitationIdFor,
  LIMITS,
  normalizeEmail,
  PAPER_DOC_ID,
  type Question,
  questionsDelivered,
  ROSTER_DOC_ID,
  type ScoringPolicy,
  type TextRubric,
} from '@exam/contracts';
import {
  collection,
  doc,
  type DocumentReference,
  FirestoreError,
  getDoc,
  serverTimestamp,
  Timestamp,
  type WriteBatch,
  writeBatch,
} from 'firebase/firestore';
import { AuthStore } from './auth.store';
import { FIRESTORE } from './firebase.providers';
import {
  answerKeyConverter,
  examMetaConverter,
  examPaperConverter,
  rosterConverter,
} from './firestore-converters';

export type NewQuestionInput =
  | {
      readonly type: 'CHOICE';
      readonly prompt: string;
      readonly points: number;
      readonly options: readonly string[];
      readonly correctIndex: number;
    }
  | {
      readonly type: 'TEXT';
      readonly prompt: string;
      readonly points: number;
      readonly maxLength: number;
      readonly modelAnswer: string;
      readonly criteria: string;
    };

export interface NewExamInput {
  readonly title: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly window: ExamWindow;
  readonly integrity: IntegrityPolicy;
  readonly scoring: ScoringPolicy;
  readonly delivery: DeliveryPolicy;
  readonly access: AccessPolicy;
  /** Invited emails (used when `access.mode === 'ROSTER'`). */
  readonly roster: readonly string[];
  readonly questions: readonly NewQuestionInput[];
}

export interface CreatedExam {
  readonly examId: string;
  readonly accessCode: string;
}

/** Everything the editor needs to re-open an exam. */
export interface EditableExam {
  readonly meta: ExamMeta;
  readonly paper: ExamPaper;
  readonly key: AnswerKeyRecord;
  readonly roster: readonly string[];
}

const MAX_CODE_ATTEMPTS = 4;

/**
 * Examiner-side writes. Every multi-document change is ONE atomic batch, so candidates never see a
 * half-updated exam. The rules enforce ownership, shapes, and the post-start lock.
 */
@Service()
export class ExamAuthoringService {
  readonly #db = inject(FIRESTORE);
  readonly #auth = inject(AuthStore);

  /**
   * Creates meta, paper, answer key, access code, roster and invitations. A code collision is
   * rejected by the rules (codes can only be claimed once); we then retry with a fresh code.
   */
  async createExam(input: NewExamInput, status: Exclude<ExamStatus, 'CLOSED'>): Promise<CreatedExam> {
    const ownerId = this.#requireExaminer();
    const content = splitContent(input);

    for (let attempt = 1; ; attempt++) {
      const examRef = doc(collection(this.#db, COLLECTIONS.exams));
      const accessCode = generateAccessCode();
      const batch = writeBatch(this.#db);

      batch.set(examRef, {
        ...metaFields(input, content),
        ownerId,
        accessCode,
        status,
        lockedAt: null,
        resultsPublished: false,
        createdAt: serverTimestamp(),
      });
      this.#writeContent(batch, examRef, ownerId, content);
      batch.set(doc(this.#db, COLLECTIONS.accessCodes, accessCode), {
        ...accessCodeFields(input, content, status),
        code: accessCode,
        examId: examRef.id,
        ownerId,
      });
      this.#syncRoster(batch, examRef, ownerId, accessCode, input, status, [], input.roster);

      try {
        await batch.commit();
        return { examId: examRef.id, accessCode };
      } catch (error) {
        const collision = error instanceof FirestoreError && error.code === 'permission-denied';
        if (!collision || attempt >= MAX_CODE_ATTEMPTS) throw error;
      }
    }
  }

  async loadExam(examId: string): Promise<EditableExam> {
    const examRef = doc(this.#db, COLLECTIONS.exams, examId);
    const [meta, paper, key, roster] = await Promise.all([
      getDoc(examRef.withConverter(examMetaConverter)),
      getDoc(doc(examRef, COLLECTIONS.paper, PAPER_DOC_ID).withConverter(examPaperConverter)),
      getDoc(doc(examRef, COLLECTIONS.private, ANSWER_KEY_DOC_ID).withConverter(answerKeyConverter)),
      getDoc(doc(examRef, COLLECTIONS.private, ROSTER_DOC_ID).withConverter(rosterConverter)),
    ]);
    if (!meta.exists() || !paper.exists() || !key.exists()) throw new Error('محتوى الاختبار غير موجود.');
    return { meta: meta.data(), paper: paper.data(), key: key.data(), roster: roster.data()?.emails ?? [] };
  }

  async loadRoster(examId: string): Promise<readonly string[]> {
    const snap = await getDoc(
      doc(this.#db, COLLECTIONS.exams, examId, COLLECTIONS.private, ROSTER_DOC_ID).withConverter(rosterConverter),
    );
    return snap.data()?.emails ?? [];
  }

  /**
   * Saves edits. Before the first candidate starts, everything can change. After that (locked),
   * only the roster/invitations and the lifecycle status — questions and answers are frozen.
   */
  async updateExam(current: EditableExam, input: NewExamInput, status: ExamStatus): Promise<void> {
    const ownerId = this.#requireExaminer();
    const { meta } = current;
    const examRef = doc(this.#db, COLLECTIONS.exams, meta.id);
    const batch = writeBatch(this.#db);

    if (meta.lockedAt === null) {
      const content = splitContent(input);
      // update(), not set(): identity fields (owner, code, createdAt, lock) stay byte-for-byte.
      batch.update(examRef, { ...metaFields(input, content), status });
      this.#writeContent(batch, examRef, ownerId, content);
      batch.update(doc(this.#db, COLLECTIONS.accessCodes, meta.accessCode), {
        ...accessCodeFields(input, content, status),
      });
      this.#syncRoster(batch, examRef, ownerId, meta.accessCode, input, status, current.roster, input.roster);
    } else {
      if (status !== meta.status) {
        batch.update(examRef, { status });
        batch.update(doc(this.#db, COLLECTIONS.accessCodes, meta.accessCode), { status });
      }
      this.#syncRoster(batch, examRef, ownerId, meta.accessCode, metaAsInput(meta), status, current.roster, input.roster);
    }
    await batch.commit();
  }

  /** Publish / close / reopen. Also updates the lobby card and every invitation. */
  async setStatus(meta: ExamMeta, status: ExamStatus): Promise<void> {
    this.#requireExaminer();
    const examRef = doc(this.#db, COLLECTIONS.exams, meta.id);
    const roster = await getDoc(doc(examRef, COLLECTIONS.private, ROSTER_DOC_ID).withConverter(rosterConverter));
    const batch = writeBatch(this.#db);
    batch.update(examRef, { status });
    batch.update(doc(this.#db, COLLECTIONS.accessCodes, meta.accessCode), { status });
    for (const email of roster.data()?.emails ?? []) {
      batch.update(doc(this.#db, COLLECTIONS.invitations, invitationIdFor(meta.id, email)), { status });
    }
    await batch.commit();
  }

  /** Copies an exam (questions, answers, settings, roster) into a new draft with a new code. */
  async duplicateExam(examId: string): Promise<CreatedExam> {
    const source = await this.loadExam(examId);
    const input = toInput(source);
    return this.createExam({ ...input, title: `${input.title} (نسخة)`.slice(0, 200) }, 'DRAFT');
  }

  #requireExaminer(): string {
    const ownerId = this.#auth.uid();
    if (!ownerId || !this.#auth.isExaminer()) throw new Error('سجِّل الدخول بوصفك مُمتحِنًا أولًا.');
    return ownerId;
  }

  #writeContent(batch: WriteBatch, examRef: DocumentReference, ownerId: string, content: Content): void {
    batch.set(doc(examRef, COLLECTIONS.paper, PAPER_DOC_ID), { ownerId, questions: content.questions });
    batch.set(doc(examRef, COLLECTIONS.private, ANSWER_KEY_DOC_ID), {
      ownerId,
      answers: content.answerKey,
      rubrics: content.rubrics,
    });
  }

  /** Writes the roster and makes invitations match it exactly (adds, refreshes, removes). */
  #syncRoster(
    batch: WriteBatch,
    examRef: DocumentReference,
    ownerId: string,
    code: string,
    input: Pick<NewExamInput, 'title' | 'durationSeconds' | 'window' | 'access'>,
    status: ExamStatus,
    previous: readonly string[],
    next: readonly string[],
  ): void {
    const wanted = input.access.mode === 'ROSTER' ? unique(next) : [];
    batch.set(doc(examRef, COLLECTIONS.private, ROSTER_DOC_ID), { ownerId, emails: wanted });
    const window = {
      opensAt: Timestamp.fromMillis(input.window.opensAt),
      closesAt: Timestamp.fromMillis(input.window.closesAt),
    };
    for (const email of wanted) {
      batch.set(doc(this.#db, COLLECTIONS.invitations, invitationIdFor(examRef.id, email)), {
        examId: examRef.id,
        ownerId,
        email,
        code,
        title: input.title.trim(),
        durationSeconds: input.durationSeconds,
        window,
        status,
      });
    }
    const keep = new Set(wanted);
    for (const email of unique(previous)) {
      if (!keep.has(email)) {
        batch.delete(doc(this.#db, COLLECTIONS.invitations, invitationIdFor(examRef.id, email)));
      }
    }
  }
}

/* ---------------------------------------------------------------------------------------------- */

interface Content {
  readonly questions: Question[];
  readonly answerKey: Record<string, number>;
  readonly rubrics: Record<string, TextRubric>;
  readonly maxScore: number;
}

/**
 * Splits authored questions by audience: the paper never contains answers or rubrics; those go to
 * the owner-only answer key document.
 */
function splitContent(input: NewExamInput): Content {
  const questions: Question[] = [];
  const answerKey: Record<string, number> = {};
  const rubrics: Record<string, TextRubric> = {};
  input.questions.forEach((q, i) => {
    const id = `q${i + 1}`;
    const base = { id, prompt: q.prompt.trim(), points: q.points };
    if (q.type === 'TEXT') {
      questions.push({ ...base, type: 'TEXT', maxLength: q.maxLength });
      rubrics[id] = { modelAnswer: q.modelAnswer.trim(), criteria: q.criteria.trim() };
    } else {
      questions.push({ ...base, type: 'CHOICE', options: q.options.map((o) => o.trim()) });
      answerKey[id] = q.correctIndex;
    }
  });
  return { questions, answerKey, rubrics, maxScore: questions.reduce((s, q) => s + q.points, 0) };
}

function metaFields(input: NewExamInput, content: Content) {
  const delivery: DeliveryPolicy = {
    ...input.delivery,
    questionsPerCandidate:
      input.delivery.questionsPerCandidate &&
      input.delivery.questionsPerCandidate < content.questions.length
        ? input.delivery.questionsPerCandidate
        : null,
  };
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    durationSeconds: input.durationSeconds,
    window: {
      opensAt: Timestamp.fromMillis(input.window.opensAt),
      closesAt: Timestamp.fromMillis(input.window.closesAt),
    },
    integrity: input.integrity,
    scoring: input.scoring,
    delivery,
    access: input.access,
    questionCount: content.questions.length,
    maxScore: content.maxScore,
  };
}

function accessCodeFields(input: NewExamInput, content: Content, status: ExamStatus) {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    durationSeconds: input.durationSeconds,
    questionCount: questionsDelivered(content.questions.length, input.delivery),
    window: {
      opensAt: Timestamp.fromMillis(input.window.opensAt),
      closesAt: Timestamp.fromMillis(input.window.closesAt),
    },
    status,
    accessMode: input.access.mode,
  };
}

function metaAsInput(meta: ExamMeta): Pick<NewExamInput, 'title' | 'durationSeconds' | 'window' | 'access'> {
  return { title: meta.title, durationSeconds: meta.durationSeconds, window: meta.window, access: meta.access };
}

/** Rebuilds editor input from a stored exam (used by duplicate). */
export function toInput(exam: EditableExam): NewExamInput {
  const { meta, paper, key, roster } = exam;
  return {
    title: meta.title,
    description: meta.description,
    durationSeconds: meta.durationSeconds,
    window: meta.window,
    integrity: meta.integrity,
    scoring: meta.scoring,
    delivery: meta.delivery,
    access: meta.access,
    roster,
    questions: paper.questions.map((q) =>
      q.type === 'TEXT'
        ? {
            type: 'TEXT' as const,
            prompt: q.prompt,
            points: q.points,
            maxLength: q.maxLength,
            modelAnswer: key.rubrics[q.id]?.modelAnswer ?? '',
            criteria: key.rubrics[q.id]?.criteria ?? '',
          }
        : {
            type: 'CHOICE' as const,
            prompt: q.prompt,
            points: q.points,
            options: q.options,
            correctIndex: key.answers[q.id] ?? 0,
          },
    ),
  };
}

function unique(emails: readonly string[]): string[] {
  return [...new Set(emails.map(normalizeEmail).filter(Boolean))].slice(0, LIMITS.maxRosterSize);
}

export function generateAccessCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LIMITS.accessCodeLength));
  return Array.from(bytes, (b) => ACCESS_CODE_ALPHABET[b % ACCESS_CODE_ALPHABET.length]).join('');
}
