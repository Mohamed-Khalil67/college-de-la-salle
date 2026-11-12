import type { SessionUser } from '@cdls/shared';

type Who = Pick<SessionUser, 'role' | 'isPlanner'> | null | undefined;

/**
 * A teacher with the « Planificateur » permission: they reach the administration's structure screens
 * (« Planification ») from the teacher space. The API decides the rights (`access/grants.ts`); this only
 * steers the screens. An admin carrying the permission is an admin first: it changes nothing for them.
 */
export function isTeacherPlanner(user: Who): boolean {
  return user?.role === 'teacher' && user.isPlanner;
}

/** May this user open the administration's structure screens? The admin, or a teacher who is planificateur. */
export function opensStructure(user: Who): boolean {
  return user?.role === 'admin' || isTeacherPlanner(user);
}
