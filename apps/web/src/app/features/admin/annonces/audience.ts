import { type ClassDto, type PostDto, SECTION_LABELS, type SectionDto } from '@cdls/shared';

/**
 * Who an announcement is for, as the administration chooses it: any class, a whole section, or the whole school.
 * (The teacher space has its own version limited to the teacher's classes; a later step can merge the two
 * into `shared/utils`.) Plain functions, tested by `audience.spec.ts`.
 */

export interface AudienceOption {
  readonly value: string;
  readonly label: string;
}

export const WHOLE_SCHOOL = 'all';

/** The whole school first (the usual case for the administration), then each section, then each class. */
export function audienceOptions(classes: readonly ClassDto[], sections: readonly SectionDto[]): AudienceOption[] {
  return [
    { value: WHOLE_SCHOOL, label: 'Tout le collège' },
    ...sections.map((s) => ({ value: `section:${s.id}`, label: `Tout le ${s.label}` })),
    ...[...classes]
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
      .map((c) => ({ value: `class:${c.id}`, label: `${c.label} (${SECTION_LABELS[c.sectionCode]})` })),
  ];
}

export function audienceFromValue(value: string): { readonly classId: string | null; readonly sectionId: string | null } {
  if (value.startsWith('class:')) return { classId: value.slice('class:'.length), sectionId: null };
  if (value.startsWith('section:')) return { classId: null, sectionId: value.slice('section:'.length) };
  return { classId: null, sectionId: null };
}

/** « Première », « tout le Bac français » or « tout le collège » (read after « pour »). */
export function audienceLabel(
  post: Pick<PostDto, 'classId' | 'sectionId'>,
  classes: readonly ClassDto[],
  sections: readonly SectionDto[],
): string {
  if (post.classId) return classes.find((c) => c.id === post.classId)?.label ?? 'une classe';
  if (post.sectionId) {
    const section = sections.find((s) => s.id === post.sectionId);
    return section ? `tout le ${section.label}` : 'une section';
  }
  return 'tout le collège';
}
