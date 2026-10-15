import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '@exam/data-access-exams';

/** UX guard only — authorization is enforced by firestore.rules, not by the router. */
export const examinerGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();
  return auth.isExaminer()
    ? true
    : router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } });
};
