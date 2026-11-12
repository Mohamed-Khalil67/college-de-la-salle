import type { ClassDto, SectionDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { audienceFromValue, audienceLabel, audienceOptions, WHOLE_SCHOOL } from './audience';

const sections: SectionDto[] = [
  { id: 's1', code: 'bac', label: 'Bac français' },
  { id: 's2', code: 'nationale', label: 'Bac nationale' },
];
const classes = [
  { id: 'c2', label: 'Terminale', sectionId: 's1', sectionCode: 'bac' },
  { id: 'c1', label: 'Première', sectionId: 's1', sectionCode: 'bac' },
] as ClassDto[];

describe('audienceOptions', () => {
  it('lists the whole school, the sections, then the classes by name', () => {
    const options = audienceOptions(classes, sections);
    expect(options.map((o) => o.value)).toEqual([WHOLE_SCHOOL, 'section:s1', 'section:s2', 'class:c1', 'class:c2']);
    expect(options[0]?.label).toBe('Tout le collège');
    expect(options[3]?.label).toContain('Première');
  });

  it('still offers the whole school when nothing else loaded', () => {
    expect(audienceOptions([], [])).toEqual([{ value: WHOLE_SCHOOL, label: 'Tout le collège' }]);
  });
});

describe('audienceFromValue', () => {
  it('reads a class, a section or the whole school', () => {
    expect(audienceFromValue('class:c1')).toEqual({ classId: 'c1', sectionId: null });
    expect(audienceFromValue('section:s2')).toEqual({ classId: null, sectionId: 's2' });
    expect(audienceFromValue(WHOLE_SCHOOL)).toEqual({ classId: null, sectionId: null });
  });
});

describe('audienceLabel', () => {
  it('says who an announcement was for', () => {
    expect(audienceLabel({ classId: 'c1', sectionId: null }, classes, sections)).toBe('Première');
    expect(audienceLabel({ classId: null, sectionId: 's2' }, classes, sections)).toBe('tout le Bac nationale');
    expect(audienceLabel({ classId: null, sectionId: null }, classes, sections)).toBe('tout le collège');
    expect(audienceLabel({ classId: 'gone', sectionId: null }, classes, sections)).toBe('une classe');
  });
});
