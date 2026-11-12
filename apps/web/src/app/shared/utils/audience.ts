import type { ClassDto, PostDto, SectionDto } from '@cdls/shared';

/**
 * Who an announcement is for, as the forms of the teacher and the administration write it: `class:<id>`,
 * `section:<id>` or `all`. The lists of choices differ by role (each space has its own `audienceOptions`);
 * reading a choice and naming an audience are the same for both.
 */

export interface AudienceOption {
  readonly value: string;
  readonly label: string;
}

/** The value of the « whole school » choice. */
export const WHOLE_SCHOOL = 'all';

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
