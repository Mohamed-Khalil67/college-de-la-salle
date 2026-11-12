import type { ClassDto, SectionDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { audienceFromValue, audienceLabel, WHOLE_SCHOOL } from './audience';

const sections: SectionDto[] = [
  { id: 's1', code: 'bac', label: 'Bac français' },
  { id: 's2', code: 'nationale', label: 'Bac nationale' },
];
const classes = [{ id: 'c1', label: 'Première', sectionId: 's1', sectionCode: 'bac' }] as ClassDto[];

describe('audienceFromValue', () => {
  it('reads a class, a section or the whole school', () => {
    expect(audienceFromValue('class:c1')).toEqual({ classId: 'c1', sectionId: null });
    expect(audienceFromValue('section:s2')).toEqual({ classId: null, sectionId: 's2' });
    expect(audienceFromValue(WHOLE_SCHOOL)).toEqual({ classId: null, sectionId: null });
    expect(audienceFromValue('')).toEqual({ classId: null, sectionId: null });
  });
});

describe('audienceLabel', () => {
  it('says who an announcement was for', () => {
    expect(audienceLabel({ classId: 'c1', sectionId: null }, classes, sections)).toBe('Première');
    expect(audienceLabel({ classId: null, sectionId: 's2' }, classes, sections)).toBe('tout le Bac nationale');
    expect(audienceLabel({ classId: null, sectionId: null }, classes, sections)).toBe('tout le collège');
  });

  it('does not fail on a class or a section that is gone', () => {
    expect(audienceLabel({ classId: 'gone', sectionId: null }, classes, sections)).toBe('une classe');
    expect(audienceLabel({ classId: null, sectionId: 'gone' }, classes, sections)).toBe('une section');
  });
});
