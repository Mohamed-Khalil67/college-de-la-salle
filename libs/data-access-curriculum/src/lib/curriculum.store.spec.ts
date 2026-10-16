import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SUBJECT_IDS } from './curriculum.model';
import { CurriculumStore } from './curriculum.store';

describe('CurriculumStore', () => {
  const store = () => TestBed.inject(CurriculumStore);

  it('serves every subject of the taxonomy, with a syllabus', () => {
    expect(store().subjects().map((s) => s.id)).toEqual([...SUBJECT_IDS]);
    for (const subject of store().subjects()) expect(subject.syllabus.length).toBeGreaterThan(0);
  });

  it('looks subjects up by id and rejects unknown ids', () => {
    expect(store().subject('physics')?.name).toBe('الفيزياء');
    expect(store().subject('biology')).toBeNull();
    expect(store().subject('__proto__')).toBeNull();
  });

  it('maps subjects to Thanaweya Amma tracks', () => {
    const math = store().subject('mathematics');
    expect(math && store().tracksFor(math).map((t) => t.name)).toEqual(['علمي رياضة']);
    const arabic = store().subject('arabic');
    expect(arabic && store().tracksFor(arabic)).toHaveLength(3);
  });

  it('lists news newest first', () => {
    const dates = store().news().map((n) => n.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('carries the history of Arabic in Egypt on the Arabic subject', () => {
    const arabic = store().subject('arabic');
    expect(arabic?.contextModules.map((m) => m.title)).toContain('تاريخ اللغة العربية في مصر');
  });
});
