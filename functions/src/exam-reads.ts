import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { normalizeQuestion, type Question } from './contracts';

/** Reads the paper's questions, upgrading documents written before question types existed. */
export function readQuestions(paperSnap: DocumentSnapshot): Question[] {
  const raw = (paperSnap.get('questions') ?? []) as Parameters<typeof normalizeQuestion>[0][];
  return raw.map(normalizeQuestion);
}
