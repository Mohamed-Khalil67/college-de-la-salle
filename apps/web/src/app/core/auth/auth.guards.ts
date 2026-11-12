import { inject } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import type { Role } from '@cdls/shared';
import { AuthStore, FIRST_ACCESS } from './auth-store';
import { isTeacherPlanner, opensStructure } from './planner';

/**
 * Lets only `role` into an area. A visitor goes to the login page (and comes back afterwards);
 * someone signed in with another role goes to their own space.
 */
export function roleGuard(role: Role): CanMatchFn {
  return async (_route, segments) => {
    const store = inject(AuthStore);
    const router = inject(Router);
    await store.restore();
    const user = store.user();
    if (!user) {
      const suite = '/' + segments.map((s) => s.path).join('/');
      return router.createUrlTree(['/connexion'], { queryParams: { suite } });
    }
    if (user.mustChangePassword) return router.parseUrl(FIRST_ACCESS);
    return user.role === role ? true : router.parseUrl(store.home());
  };
}

/**
 * The first-access page: for a signed-in user who still has a temporary password. A visitor goes to the
 * login page; someone who already chose a password goes to their space.
 */
export const firstAccessGuard: CanMatchFn = async () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.restore();
  const user = store.user();
  if (!user) return router.createUrlTree(['/connexion']);
  return user.mustChangePassword ? true : router.parseUrl(store.home());
};

/** The login page: someone already signed in goes straight to their space. */
export const anonymousGuard: CanMatchFn = async () => {
  const store = inject(AuthStore);
  await store.restore();
  return store.user() ? inject(Router).parseUrl(store.home()) : true;
};

/** Where a planner lands in the administration: the planner's one page. */
export const PLANNER_HOME = '/admin/planification';

/**
 * The administration's structure screens (subjects, classes, rooms, activity types, school year): the admin,
 * and teachers the admin marked planificateur. A teacher's permission is read again from /auth/me (at most once a minute), so a promotion
 * or a revocation shows without signing in again (the API checks it on every request anyway).
 */
export const structureGuard: CanMatchFn = async (_route, segments) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.restore();
  let user = store.user();
  if (!user) {
    const suite = '/' + segments.map((s) => s.path).join('/');
    return router.createUrlTree(['/connexion'], { queryParams: { suite } });
  }
  if (user.mustChangePassword) return router.parseUrl(FIRST_ACCESS);
  // A teacher's permission is read again first (at most once a minute): a promotion shows without signing in again.
  if (user.role === 'teacher') {
    await store.reloadUserIfStale();
    user = store.user();
  }
  return opensStructure(user) ? true : router.parseUrl(store.home());
};

/** The pages only the admin opens (users, assignments, validations, report cards, messages): a planner goes back to the structure screens. */
export const adminOnlyGuard: CanMatchFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const user = store.user();
  if (user?.role === 'admin') return true;
  return router.parseUrl(isTeacherPlanner(user) ? PLANNER_HOME : store.home());
};
