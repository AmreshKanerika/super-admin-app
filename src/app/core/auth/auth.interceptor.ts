import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { AuthService } from './auth.service';

// Attaches the signed-in user's Keycloak access token to every request to our own backend
// (flip-admin, via the gateway) — without it, FlipAdminFilter on the gateway rejects the request
// before it ever reaches flip-admin. Requests to Keycloak itself (login/refresh/logout) are
// untouched since they authenticate with client_id/credentials instead.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isApiRequest = req.url.startsWith(API_BASE_URL);
  const token = auth.getAccessToken();

  const request$ = isApiRequest && token
    ? from(auth.ensureValidSession()).pipe(switchMap(valid => {
        if (!valid) return throwError(() => new Error('Your session expired. Please sign in again.'));
        return next(req.clone({ setHeaders: { Authorization: `Bearer ${auth.getAccessToken()}` } }));
      }))
    : next(req);

  return request$.pipe(
    catchError((err) => {
      if (isApiRequest && err.status === 401) {
        auth.logout();
      }
      return throwError(() => err);
    })
  );
};
