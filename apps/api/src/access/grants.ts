import type { AuthUser } from '../common/auth-user.js';
import type { Grant } from '../common/decorators.js';

/** Is this user a coordinateur (an active teacher the admin marked so)? */
export function isCoordinator(user: AuthUser): boolean {
  return user.role === 'teacher' && !!user.teacherId && user.isCoordinator;
}

/** May this user edit the year's structure? The admin or a coordinator. */
export function canEditStructure(user: AuthUser): boolean {
  return user.role === 'admin' || isCoordinator(user);
}

/** Does the user hold this grant of @Roles()? */
export function hasGrant(user: AuthUser, grant: Grant): boolean {
  return grant === 'coordinator' ? isCoordinator(user) : user.role === grant;
}
