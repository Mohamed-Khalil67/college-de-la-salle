import type {
  AccessPolicy,
  AnswerValue,
  CatalogPolicy,
  ChoiceQuestion,
  DeliveryPolicy,
  ExamStatus,
  Question,
  QuestionId,
  SessionLayout,
} from './exam.contracts';

/*
 * Per-candidate delivery: question-bank draw, question shuffling and option shuffling. Runs on the
 * server at session start; the candidate receives only the resulting paper, and the grader maps
 * their answers back through the stored layout. Pure and RNG-injected so it is testable.
 */

export const DEFAULT_DELIVERY: DeliveryPolicy = {
  shuffleQuestions: false,
  shuffleOptions: false,
  questionsPerCandidate: null,
};

export const DEFAULT_ACCESS: AccessPolicy = { mode: 'CODE' };

export const DEFAULT_CATALOG: CatalogPolicy = { subjectId: null, listed: false };

/** Whether an exam should have a public practice card right now. */
export function isPubliclyListed(exam: {
  readonly catalog: CatalogPolicy;
  readonly status: ExamStatus;
  readonly access: AccessPolicy;
}): boolean {
  return exam.catalog.listed && exam.catalog.subjectId !== null && exam.status === 'PUBLISHED' && exam.access.mode === 'CODE';
}

/** Uniform random integer in [0, n). */
export type RandomInt = (n: number) => number;

function shuffled<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Number of questions each candidate receives. */
export function questionsDelivered(total: number, delivery: DeliveryPolicy | undefined): number {
  const n = delivery?.questionsPerCandidate;
  return n && n > 0 && n < total ? n : total;
}

export function buildLayout(
  questions: readonly Question[],
  delivery: DeliveryPolicy | undefined,
  randomInt: RandomInt,
): SessionLayout {
  const policy = delivery ?? DEFAULT_DELIVERY;
  const count = questionsDelivered(questions.length, policy);

  // Draw from the bank (random subset), then decide the order.
  let chosen = [...questions];
  if (count < questions.length) {
    const picked = new Set(shuffled(questions, randomInt).slice(0, count).map((q) => q.id));
    chosen = questions.filter((q) => picked.has(q.id)); // keep authored order unless shuffling
  }
  if (policy.shuffleQuestions) chosen = shuffled(chosen, randomInt);

  const optionOrders: Record<QuestionId, number[]> = {};
  for (const q of chosen) {
    if (q.type !== 'CHOICE') continue;
    const identity = q.options.map((_, i) => i);
    optionOrders[q.id] = policy.shuffleOptions ? shuffled(identity, randomInt) : identity;
  }
  return { questionIds: chosen.map((q) => q.id), optionOrders };
}

/** The candidate's paper: their questions, in their order, with their option order. */
export function applyLayout(questions: readonly Question[], layout: SessionLayout): Question[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return layout.questionIds.flatMap((id): Question[] => {
    const q = byId.get(id);
    if (!q) return [];
    if (q.type !== 'CHOICE') return [q];
    const order = layout.optionOrders[id] ?? q.options.map((_, i) => i);
    const options = order.map((original) => q.options[original]);
    const reordered: ChoiceQuestion = { ...q, options };
    return [reordered];
  });
}

/** Questions in session order (for grading and review). Falls back to the whole paper. */
export function deliveredQuestions(
  questions: readonly Question[],
  questionIds: readonly QuestionId[] | null | undefined,
): Question[] {
  if (!questionIds?.length) return [...questions];
  const byId = new Map(questions.map((q) => [q.id, q]));
  return questionIds.flatMap((id) => {
    const question = byId.get(id);
    return question ? [question] : [];
  });
}

/**
 * Maps displayed option indexes back to authored indexes. Answers to questions the candidate was
 * not given are dropped, so a forged answer to an undrawn question can never score.
 */
export function toCanonicalAnswers(
  answers: Readonly<Record<QuestionId, unknown>>,
  layout: SessionLayout | null | undefined,
): Record<QuestionId, AnswerValue> {
  const out: Record<QuestionId, AnswerValue> = {};
  const allowed = layout ? new Set(layout.questionIds) : null;
  for (const [qid, value] of Object.entries(answers)) {
    if (allowed && !allowed.has(qid)) continue;
    if (typeof value === 'string') {
      out[qid] = value;
    } else if (Number.isInteger(value)) {
      const order = layout?.optionOrders[qid];
      const displayed = value as number;
      if (!order) out[qid] = displayed;
      else if (displayed >= 0 && displayed < order.length) out[qid] = order[displayed];
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Access: exam rosters
 * ---------------------------------------------------------------------------------------------- */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL.test(email);
}

export interface ParsedRoster {
  readonly emails: string[];
  readonly invalid: string[];
}

/** Parses a pasted list: one email per line, or separated by commas, semicolons or spaces. */
export function parseRoster(text: string): ParsedRoster {
  const emails = new Set<string>();
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;،]+/)) {
    const e = normalizeEmail(token);
    if (!e) continue;
    if (isValidEmail(e)) emails.add(e);
    else invalid.push(token.trim());
  }
  return { emails: [...emails], invalid };
}
