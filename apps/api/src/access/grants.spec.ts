import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessService } from './access.service.js';
import { canEditStructure, hasGrant, isPlanner } from './grants.js';

const user = (role: AuthUser['role'], over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u',
  email: 'x@y.z',
  role,
  firstName: 'X',
  lastName: 'Y',
  studentId: null,
  teacherId: role === 'teacher' ? 't1' : null,
  classId: null,
  isPlanner: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
  ...over,
});

describe('grants', () => {
  it('lets only staff accounts marked planificateur plan', () => {
    expect(isPlanner(user('teacher', { isPlanner: true }))).toBe(true);
    expect(isPlanner(user('teacher'))).toBe(false);
    // The permission is on the account: an admin account may carry it too.
    expect(isPlanner(user('admin', { isPlanner: true }))).toBe(true);
    expect(isPlanner(user('admin'))).toBe(false);
    // A student never holds it, whatever the flag says; nor a teacher account without its teacher profile.
    expect(isPlanner(user('student', { isPlanner: true }))).toBe(false);
    expect(isPlanner(user('teacher', { isPlanner: true, teacherId: null }))).toBe(false);
  });

  it('lets the admin and planners edit the structure, nobody else', () => {
    expect(canEditStructure(user('admin'))).toBe(true);
    expect(canEditStructure(user('teacher', { isPlanner: true }))).toBe(true);
    expect(canEditStructure(user('teacher'))).toBe(false);
    expect(canEditStructure(user('student'))).toBe(false);
    expect(canEditStructure(user('student', { isPlanner: true }))).toBe(false);
  });

  it('matches a role or the planner grant', () => {
    expect(hasGrant(user('admin'), 'admin')).toBe(true);
    expect(hasGrant(user('admin'), 'planner')).toBe(false);
    expect(hasGrant(user('teacher', { isPlanner: true }), 'planner')).toBe(true);
    expect(hasGrant(user('admin', { isPlanner: true }), 'planner')).toBe(true);
    expect(hasGrant(user('teacher', { isPlanner: true }), 'admin')).toBe(false);
    expect(hasGrant(user('student', { isPlanner: true }), 'planner')).toBe(false);
  });

  describe('AccessService.assertCanEditStructure', () => {
    let access: AccessService;
    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [AccessService, { provide: PrismaService, useValue: {} }],
      }).compile();
      access = moduleRef.get(AccessService);
    });

    it('passes the admin and a planner, refuses the rest', () => {
      expect(() => access.assertCanEditStructure(user('admin'))).not.toThrow();
      expect(() =>
        access.assertCanEditStructure(user('teacher', { isPlanner: true })),
      ).not.toThrow();
      expect(() => access.assertCanEditStructure(user('teacher'))).toThrow(ForbiddenException);
      expect(() => access.assertCanEditStructure(user('student'))).toThrow(ForbiddenException);
    });
  });
});
