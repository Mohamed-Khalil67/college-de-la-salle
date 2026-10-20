import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Role } from '@cdls/shared';
import type { AuthUser } from './auth-user.js';
import { IS_PUBLIC, ROLES } from './decorators.js';
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

  const metadata = (values: { roles?: Role[]; isPublic?: boolean }) =>
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
});
