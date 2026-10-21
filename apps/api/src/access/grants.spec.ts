import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessService } from './access.service.js';
import { canEditStructure, hasGrant, isCoordinator } from './grants.js';

const user = (role: AuthUser['role'], over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u',
  email: 'x@y.z',
  role,
  firstName: 'X',
  lastName: 'Y',
  studentId: null,
  teacherId: role === 'teacher' ? 't1' : null,
  classId: null,
  isCoordinator: false,
  ...over,
});

describe('grants', () => {
  it('lets only teachers marked coordinateur coordinate', () => {
    expect(isCoordinator(user('teacher', { isCoordinator: true }))).toBe(true);
    expect(isCoordinator(user('teacher'))).toBe(false);
    // The flag means nothing outside a teacher profile.
    expect(isCoordinator(user('student', { isCoordinator: true }))).toBe(false);
    expect(isCoordinator(user('admin', { isCoordinator: true }))).toBe(false);
    expect(isCoordinator(user('teacher', { isCoordinator: true, teacherId: null }))).toBe(false);
  });

  it('lets the admin and coordinators edit the structure, nobody else', () => {
    expect(canEditStructure(user('admin'))).toBe(true);
    expect(canEditStructure(user('teacher', { isCoordinator: true }))).toBe(true);
    expect(canEditStructure(user('teacher'))).toBe(false);
    expect(canEditStructure(user('student'))).toBe(false);
  });

  it('matches a role or the coordinator grant', () => {
    expect(hasGrant(user('admin'), 'admin')).toBe(true);
    expect(hasGrant(user('admin'), 'coordinator')).toBe(false);
    expect(hasGrant(user('teacher', { isCoordinator: true }), 'coordinator')).toBe(true);
    expect(hasGrant(user('teacher', { isCoordinator: true }), 'admin')).toBe(false);
  });

  describe('AccessService.assertCanEditStructure', () => {
    let access: AccessService;
    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [AccessService, { provide: PrismaService, useValue: {} }],
      }).compile();
      access = moduleRef.get(AccessService);
    });

    it('passes the admin and a coordinator, refuses the rest', () => {
      expect(() => access.assertCanEditStructure(user('admin'))).not.toThrow();
      expect(() =>
        access.assertCanEditStructure(user('teacher', { isCoordinator: true })),
      ).not.toThrow();
      expect(() => access.assertCanEditStructure(user('teacher'))).toThrow(ForbiddenException);
      expect(() => access.assertCanEditStructure(user('student'))).toThrow(ForbiddenException);
    });
  });
});
