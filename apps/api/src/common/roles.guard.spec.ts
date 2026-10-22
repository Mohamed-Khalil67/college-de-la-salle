import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { AuthUser } from './auth-user.js';
import { type Grant, IS_PUBLIC, ROLES } from './decorators.js';
import { RolesGuard } from './roles.guard.js';

const context = (user?: Partial<AuthUser>) =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = moduleRef.get(RolesGuard);
    reflector = moduleRef.get(Reflector);
  });

  const metadata = (values: { roles?: Grant[]; isPublic?: boolean }) =>
    vi
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) =>
        key === ROLES ? values.roles : key === IS_PUBLIC ? values.isPublic : undefined,
      );

  it('lets any signed-in user through when the route names no role', () => {
    metadata({});
    expect(guard.canActivate(context({ role: 'student' }))).toBe(true);
  });

  it('lets public routes through', () => {
    metadata({ roles: ['admin'], isPublic: true });
    expect(guard.canActivate(context())).toBe(true);
  });

  it('allows a listed role', () => {
    metadata({ roles: ['admin', 'teacher'] });
    expect(guard.canActivate(context({ role: 'teacher' }))).toBe(true);
  });

  it('refuses other roles and anonymous requests', () => {
    metadata({ roles: ['admin'] });
    expect(() => guard.canActivate(context({ role: 'student' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it('lets a coordinator through where the route names the coordinator grant', () => {
    metadata({ roles: ['admin', 'coordinator'] });
    expect(
      guard.canActivate(context({ role: 'teacher', teacherId: 't1', isCoordinator: true })),
    ).toBe(true);
    expect(guard.canActivate(context({ role: 'admin' }))).toBe(true);
    expect(() =>
      guard.canActivate(context({ role: 'teacher', teacherId: 't1', isCoordinator: false })),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({ role: 'student', isCoordinator: true }))).toThrow(
      ForbiddenException,
    );
  });

  it('does not let a coordinator through an admin-only route', () => {
    metadata({ roles: ['admin'] });
    expect(() =>
      guard.canActivate(context({ role: 'teacher', teacherId: 't1', isCoordinator: true })),
    ).toThrow(ForbiddenException);
  });
});
