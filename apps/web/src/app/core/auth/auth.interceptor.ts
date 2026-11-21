import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { passwordChangeRequired } from './auth-errors';
import { AuthStore, FIRST_ACCESS } from './auth-store';

const AUTH_PATHS = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];

/**
 * Adds the access token to every /api call. On a 401 it refreshes the session once and replays the
 * request. Only when the API refuses the refresh token does the user go back to the login page; when the
 * server is busy or out of reach (429, 5xx, network), the session stays and the request fails with its
 * error (the space layout says the server is busy). A 403 PASSWORD_CHANGE_REQUIRED
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
      if (error.status === 403 && passwordChangeRequired(error.error)) {
        void router.navigateByUrl(FIRST_ACCESS);
        return throwError(() => error);
      }
      if (error.status !== 401) return throwError(() => error);
      return from(store.refresh()).pipe(
        switchMap((outcome) => {
          if (outcome === 'ok') return next(withToken());
          if (outcome === 'signed-out') {
            void router.navigate(['/connexion'], { queryParams: { suite: router.url } });
          }
          return throwError(() => error);
        }),
      );
    }),
  );
};
