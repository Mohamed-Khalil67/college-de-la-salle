import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Role } from '@cdls/shared';
import type { AuthedRequest, AuthUser } from './auth-user.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Skips authentication (login, refresh, health). Every other route needs a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** A role, or `coordinator`: a teacher the admin marked coordinateur. */
export type Grant = Role | 'coordinator';

/** Restricts a route (or a controller) to these roles. Ownership is checked in the services. */
export const Roles = (...grants: Grant[]) => SetMetadata(ROLES, grants);

/**
 * Writes to the year's structure (school years, periods, calendar days, subjects, class subjects, rooms):
 * the admin or a coordinator. The one place this rule is spelled.
 */
export const StructureEditors = () => Roles('admin', 'coordinator');

/** The signed-in user. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});
