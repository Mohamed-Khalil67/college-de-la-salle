import { describe, expect, it } from 'vitest';
import { directoryKeysFor, hasRole, parseDirectoryTarget, parseRole, resolveRole, TEACHER_CLAIM } from './roles';

describe('roles', () => {
  it('names the claim the rules check', () => {
    expect(TEACHER_CLAIM).toBe('teacher');
  });

  it('treats unknown claims as the least-privileged role', () => {
    expect(parseRole('super_admin')).toBe('super_admin');
    expect(parseRole('examiner')).toBe('examiner');
    expect(parseRole('admin')).toBe('examinee');
    expect(parseRole(true)).toBe('examinee');
    expect(parseRole(undefined)).toBe('examinee');
  });

  it('is hierarchical', () => {
    expect(hasRole('super_admin', 'examiner')).toBe(true);
    expect(hasRole('examiner', 'examiner')).toBe(true);
    expect(hasRole('examiner', 'super_admin')).toBe(false);
    expect(hasRole('examinee', 'examiner')).toBe(false);
  });

  it('validates directory targets: emails and @domains only', () => {
    expect(parseDirectoryTarget(' Teacher@School.EDU ')).toEqual({ entry: 'teacher@school.edu', kind: 'EMAIL' });
    expect(parseDirectoryTarget('@Uni.edu')).toEqual({ entry: '@uni.edu', kind: 'DOMAIN' });
    expect(parseDirectoryTarget('@uni')).toBeNull();
    expect(parseDirectoryTarget('not-an-email')).toBeNull();
    expect(parseDirectoryTarget('')).toBeNull();
  });

  it('looks up the exact entry, then the domain', () => {
    expect(directoryKeysFor('Dr.X@Uni.edu')).toEqual(['dr.x@uni.edu', '@uni.edu']);
    expect(directoryKeysFor('nonsense')).toEqual([]);
  });

  it('resolves exact entries before domains; an exact revocation excludes one person', () => {
    const active = { role: 'examiner', status: 'ACTIVE' } as const;
    const revoked = { role: 'examiner', status: 'REVOKED' } as const;
    expect(resolveRole(null, null)).toBe('examinee');
    expect(resolveRole(null, active)).toBe('examiner');
    expect(resolveRole(revoked, active)).toBe('examinee');
    expect(resolveRole({ role: 'super_admin', status: 'ACTIVE' }, null)).toBe('super_admin');
    expect(resolveRole(null, revoked)).toBe('examinee');
  });
});
