import type { AuthUser } from '../common/auth-user.js';
import type { Grant } from '../common/decorators.js';

/**
 * Is this user a planificateur? A permission the admin sets on a staff account (a teacher or an admin). A
 * student never holds it, whatever the flag says (the database refuses it too: users_planner_not_student).
 */
export function isPlanner(user: AuthUser): boolean {
  return user.role !== 'student' && user.isPlanner;
}

/** May this user edit the year's structure? The admin or a planner. */
export function canEditStructure(user: AuthUser): boolean {
  return user.role === 'admin' || isPlanner(user);
}

/** Does the user hold this grant of @Roles()? */
export function hasGrant(user: AuthUser, grant: Grant): boolean {
  return grant === 'planner' ? isPlanner(user) : user.role === grant;
}
