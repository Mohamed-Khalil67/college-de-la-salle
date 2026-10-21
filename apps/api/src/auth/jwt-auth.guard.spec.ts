import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const USER: AuthUser = {
  id: 'u1',
  email: 'a@b.c',
  role: 'student',
  firstName: 'A',
  lastName: 'B',
  studentId: 's1',
  teacherId: null,
  classId: 'c1',
  isCoordinator: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
};

function context(authorization?: string) {
  const request: { headers: Record<string, string>; user?: AuthUser } = {
    headers: authorization ? { authorization } : {},
  };
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('JwtAuthGuard', () => {
  const auth = { userFromAccessToken: vi.fn() };
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    auth.userFromAccessToken.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [JwtAuthGuard, Reflector, { provide: AuthService, useValue: auth }],
    }).compile();
    guard = moduleRef.get(JwtAuthGuard);
    reflector = moduleRef.get(Reflector);
  });

  it('skips @Public() routes without looking at the token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(context().ctx)).resolves.toBe(true);
    expect(auth.userFromAccessToken).not.toHaveBeenCalled();
  });

  it('refuses a missing or non-Bearer header', async () => {
    await expect(guard.canActivate(context().ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(context('Basic abc').ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses an invalid token or an inactive account', async () => {
    auth.userFromAccessToken.mockResolvedValue(null);
    await expect(guard.canActivate(context('Bearer bad').ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the user for a valid token', async () => {
    auth.userFromAccessToken.mockResolvedValue(USER);
    const { ctx, request } = context('Bearer good');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(auth.userFromAccessToken).toHaveBeenCalledWith('good');
    expect(request.user).toBe(USER);
  });

  it('lets a user who must change their password reach only the marked routes', async () => {
    auth.userFromAccessToken.mockResolvedValue({ ...USER, mustChangePassword: true });
    const spy = vi.spyOn(reflector, 'getAllAndOverride');
    // Not public, not marked @AllowDuringPasswordChange().
    spy.mockReturnValue(false);
    const refused = guard.canActivate(context('Bearer good').ctx);
    await expect(refused).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(context('Bearer good').ctx)).rejects.toMatchObject({
      response: { error: 'PASSWORD_CHANGE_REQUIRED' },
    });
    // Marked: /auth/me and POST /auth/password.
    spy.mockImplementation((key: unknown) => key === 'allowDuringPasswordChange');
    await expect(guard.canActivate(context('Bearer good').ctx)).resolves.toBe(true);
  });
});
