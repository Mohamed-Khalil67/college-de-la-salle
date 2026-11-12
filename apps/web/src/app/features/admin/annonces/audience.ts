import { type ClassDto, SECTION_LABELS, type SectionDto } from '@cdls/shared';
import { type AudienceOption, WHOLE_SCHOOL } from '../../../shared/utils/audience';

/**
 * The choices of the administration's announcement form: the whole school first (the usual case), then each
 * section, then any class. (The teacher's list is limited to their own classes; reading a choice and naming an
 * audience are shared in `shared/utils/audience.ts`.)
 */
export function audienceOptions(classes: readonly ClassDto[], sections: readonly SectionDto[]): AudienceOption[] {
  return [
    { value: WHOLE_SCHOOL, label: 'Tout le collège' },
    ...sections.map((s) => ({ value: `section:${s.id}`, label: `Tout le ${s.label}` })),
    ...[...classes]
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
      .map((c) => ({ value: `class:${c.id}`, label: `${c.label} (${SECTION_LABELS[c.sectionCode]})` })),
  ];
}
