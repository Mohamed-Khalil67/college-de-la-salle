import { describe, expect, it } from 'vitest';
import { isTeacherPlanner, opensStructure } from './planner';

describe('the Planificateur permission on the web', () => {
  it('marks a teacher who holds it, nobody else', () => {
    expect(isTeacherPlanner({ role: 'teacher', isPlanner: true })).toBe(true);
    expect(isTeacherPlanner({ role: 'teacher', isPlanner: false })).toBe(false);
    expect(isTeacherPlanner({ role: 'admin', isPlanner: true })).toBe(false);
    expect(isTeacherPlanner({ role: 'student', isPlanner: true })).toBe(false);
    expect(isTeacherPlanner(null)).toBe(false);
  });

  it('opens the structure screens to the admin and teacher planners only', () => {
    expect(opensStructure({ role: 'admin', isPlanner: false })).toBe(true);
    expect(opensStructure({ role: 'admin', isPlanner: true })).toBe(true);
    expect(opensStructure({ role: 'teacher', isPlanner: true })).toBe(true);
    expect(opensStructure({ role: 'teacher', isPlanner: false })).toBe(false);
    expect(opensStructure({ role: 'student', isPlanner: true })).toBe(false);
    expect(opensStructure(undefined)).toBe(false);
  });
});
