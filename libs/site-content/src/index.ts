import type { SubjectPage } from './lib/model';
import { ARABE } from './lib/subjects/arabe';
import { MATHEMATIQUES } from './lib/subjects/mathematiques';
import { PHYSIQUE_CHIMIE } from './lib/subjects/physique-chimie';

export * from './lib/model';
export * from './lib/photos';
export * from './lib/school';
export * from './lib/sections';

/** Subjects in navigation order. */
export const SUBJECTS: readonly SubjectPage[] = [ARABE, MATHEMATIQUES, PHYSIQUE_CHIMIE];

export function subjectBySlug(slug: string): SubjectPage | null {
  return SUBJECTS.find((s) => s.slug === slug) ?? null;
}
