import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
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

  const authedReq = isApiRequest && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((err) => {
      if (isApiRequest && err.status === 401) {
        auth.logout();
      }
      return throwError(() => err);
    })
  );
};
