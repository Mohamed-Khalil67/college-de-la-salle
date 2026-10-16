import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { hasRole, type UserRole } from '@exam/contracts';
import { AuthStore } from './auth.store';

/**
 * Functional route guard: `canActivate: [roleGuard('examiner')]`. Roles are hierarchical, so a
 * super admin passes `roleGuard('examiner')`.
 *
 * UX only — authorization is enforced by firestore.rules and the Cloud Functions, which check the
 * same `role` claim. Not signed in → sign-in (with a return URL); signed in without the role → the
 * candidate home page with an explanatory notice.
 */
export function roleGuard(required: Exclude<UserRole, 'examinee'>): CanActivateFn {
  return async (_route, state) => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    await auth.whenRoleReady();
    if (hasRole(auth.userRole(), required)) return true;
    if (auth.hasAccount()) {
      return router.createUrlTree(['/exams'], { queryParams: { notAllowed: required } });
    }
    return router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } });
  };
}
