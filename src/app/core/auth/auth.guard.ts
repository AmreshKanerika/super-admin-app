import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ToastService } from '../toast.service';
import { ConsoleUserRole } from '../../models';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const valid = await auth.ensureValidSession();
  if (!valid) return router.createUrlTree(['/login']);

  // A valid Keycloak session (e.g. restored from localStorage on a fresh page load) doesn't by
  // itself mean this identity is still set up for the console — re-checked once per session here
  // rather than only at login, so a role revoked mid-session is caught on the next navigation.
  const hasRole = await auth.ensureRoleResolved();
  if (!hasRole) {
    auth.endSession();
    return router.createUrlTree(['/login'], { queryParams: { denied: '1' } });
  }
  return true;
};

export const roleGuard = (allowedRoles: ConsoleUserRole[]): CanActivateFn => {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    // Resolved up front, alongside the other injections: everything below runs after an await, and
    // inject() outside a synchronous injection context throws NG0203.
    const toast = inject(ToastService);
    // authGuard runs first on the parent route and already resolved (or denied) the role — this is
    // just a defensive re-check, not a second network round trip in the normal case.
    const hasRole = await auth.ensureRoleResolved();
    if (!hasRole) return router.createUrlTree(['/login'], { queryParams: { denied: '1' } });
    if (!allowedRoles.includes(auth.role()!)) {
      // Silently landing on the overview looks like a broken link. Every in-app entry point to a
      // restricted screen is already hidden for this role, so reaching here means a typed URL, a
      // bookmark or a stale deep link - all of which deserve a reason.
      toast.show('That screen is restricted to super admins.', 'critical');
      return router.createUrlTree(['/overview']);
    }
    return true;
  };
};
