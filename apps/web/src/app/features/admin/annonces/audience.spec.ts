import type { ClassDto, SectionDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { WHOLE_SCHOOL } from '../../../shared/utils/audience';
import { audienceOptions } from './audience';

const sections: SectionDto[] = [
  { id: 's1', code: 'bac', label: 'Bac français' },
  { id: 's2', code: 'nationale', label: 'Bac nationale' },
];
const classes = [
  { id: 'c2', label: 'Terminale', sectionId: 's1', sectionCode: 'bac' },
  { id: 'c1', label: 'Première', sectionId: 's1', sectionCode: 'bac' },
] as ClassDto[];

describe('audienceOptions (administration)', () => {
  it('lists the whole school, the sections, then every class by name', () => {
    const options = audienceOptions(classes, sections);
    expect(options.map((o) => o.value)).toEqual([WHOLE_SCHOOL, 'section:s1', 'section:s2', 'class:c1', 'class:c2']);
    expect(options[0]?.label).toBe('Tout le collège');
    expect(options[3]?.label).toContain('Première');
  });

  it('still offers the whole school when nothing else loaded', () => {
    expect(audienceOptions([], [])).toEqual([{ value: WHOLE_SCHOOL, label: 'Tout le collège' }]);
  });
});
