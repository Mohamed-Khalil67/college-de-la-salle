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

/** A role, or `planner`: a staff account (teacher or admin) the admin marked planificateur. */
export type Grant = Role | 'planner';

/** Restricts a route (or a controller) to these roles. Ownership is checked in the services. */
export const Roles = (...grants: Grant[]) => SetMetadata(ROLES, grants);

/**
 * Writes to the year's structure (school years, periods, calendar days, subjects, class subjects, rooms):
 * the admin or a planner. The one place this rule is spelled.
 */
export const StructureEditors = () => Roles('admin', 'planner');

/** The signed-in user. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});

export const ALLOW_DURING_PASSWORD_CHANGE = 'allowDuringPasswordChange';

/**
 * Keeps a route open to a user who must still choose their password (first sign-in, reset by the
 * administration). Every other authenticated route answers 403 PASSWORD_CHANGE_REQUIRED until then.
 */
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_DURING_PASSWORD_CHANGE, true);
