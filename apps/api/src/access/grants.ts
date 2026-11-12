import type { AuthUser } from '../common/auth-user.js';
import type { Grant } from '../common/decorators.js';

/**
 * Is this user a planificateur? A permission the admin sets on a staff account: an admin, or a teacher with
 * a teacher profile (as the coordinator flag required). A student never holds it, whatever the flag says
 * (the database refuses it too: users_planner_not_student).
 */
export function isPlanner(user: AuthUser): boolean {
  if (!user.isPlanner) return false;
  return user.role === 'admin' || (user.role === 'teacher' && !!user.teacherId);
}

/** May this user edit the year's structure? The admin or a planner. */
export function canEditStructure(user: AuthUser): boolean {
  return user.role === 'admin' || isPlanner(user);
}

/** Does the user hold this grant of @Roles()? */
export function hasGrant(user: AuthUser, grant: Grant): boolean {
  return grant === 'planner' ? isPlanner(user) : user.role === grant;
}
