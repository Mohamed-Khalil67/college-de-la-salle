import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '@exam/data-access-exams';

/**
 * UX guard only — authorization is enforced by firestore.rules (the `examiner` claim), not by the
 * router. Not signed in → sign-in; signed in but not an allow-listed examiner → candidate page.
 */
export const examinerGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenRoleReady();
  if (auth.isExaminer()) return true;
  if (auth.hasAccount()) return router.createUrlTree(['/'], { queryParams: { notExaminer: 1 } });
  return router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } });
};
