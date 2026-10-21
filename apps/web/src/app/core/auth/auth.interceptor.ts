import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { PASSWORD_CHANGE_REQUIRED } from '@cdls/shared';
import { AuthStore, FIRST_ACCESS } from './auth-store';

const AUTH_PATHS = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];

/**
 * Adds the access token to every /api call. On a 401 it refreshes the session once and replays the
 * request; if the refresh fails too, the user goes back to the login page. A 403 PASSWORD_CHANGE_REQUIRED
 * (temporary password still in use) sends the user to the first-access page.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/') || AUTH_PATHS.some((path) => request.url.startsWith(path))) {
    return next(request);
  }
  const store = inject(AuthStore);
  const router = inject(Router);
  const withToken = () => {
    const token = store.accessToken;
    return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  };

  return next(withToken()).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);
      if (error.status === 403 && (error.error as { error?: unknown } | null)?.error === PASSWORD_CHANGE_REQUIRED) {
        void router.navigateByUrl(FIRST_ACCESS);
        return throwError(() => error);
      }
      if (error.status !== 401) return throwError(() => error);
      return from(store.refresh()).pipe(
        switchMap((ok) => {
          if (ok) return next(withToken());
          void router.navigate(['/connexion'], { queryParams: { suite: router.url } });
          return throwError(() => error);
        }),
      );
    }),
  );
};
