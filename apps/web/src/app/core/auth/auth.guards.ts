import { inject } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import type { Role } from '@cdls/shared';
import { AuthStore, FIRST_ACCESS } from './auth-store';

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

/** Where a coordinator lands in the administration (the structure screens). */
export const COORDINATOR_HOME = '/admin/matieres';

/**
 * The administration's structure screens (subjects, classes, rooms, activity types, school year): the admin,
 * and teachers the admin marked coordinateur. A teacher's flag is read again from /auth/me (at most once a minute), so a promotion
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
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') {
    await store.reloadUserIfStale();
    user = store.user();
    if (user?.isCoordinator) return true;
  }
  return router.parseUrl(store.home());
};

/** The pages only the admin opens (users, assignments, validations, report cards, messages): a coordinator goes back to the structure screens. */
export const adminOnlyGuard: CanMatchFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const user = store.user();
  if (user?.role === 'admin') return true;
  return router.parseUrl(user?.role === 'teacher' && user.isCoordinator ? COORDINATOR_HOME : store.home());
};
