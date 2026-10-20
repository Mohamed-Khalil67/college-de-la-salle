import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth-store';

const AUTH_PATHS = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];

/**
 * Adds the access token to every /api call. On a 401 it refreshes the session once and replays the
 * request; if the refresh fails too, the user goes back to the login page.
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
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
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
