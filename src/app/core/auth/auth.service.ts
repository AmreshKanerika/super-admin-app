import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL, KEYCLOAK_BASE_URL, KEYCLOAK_CLIENT_ID, KEYCLOAK_REALM } from '../api-config';
import { decodeJwtPayload } from './jwt.util';
import { ConsoleUserRole } from '../../models';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  // When this login started — the 24h session cap is measured from here, independent of how
  // many times the access token underneath gets silently refreshed.
  loginAt: number;
}

interface IdTokenClaims {
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  email?: string;
}

export interface CurrentUser {
  name: string;
  email: string;
  initials: string;
}

interface ConsoleUserMeResponse {
  role: ConsoleUserRole;
}

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
}

interface KeycloakErrorResponse {
  error: string;
  error_description?: string;
}

const SESSION_KEY = 'sa-session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// Refresh the access token this long before it actually expires.
const REFRESH_SKEW_MS = 30_000;
const TOKEN_URL = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
const LOGOUT_URL = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly session = signal<StoredSession | null>(readStoredSession());
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  isAuthenticated = computed(() => this.session() !== null);

  // Resolved once per session via /platform/console-users/me — null while unresolved. Never trust
  // this to distinguish "still loading" from "denied"; use ensureRoleResolved()'s return value for
  // that, since a genuinely denied caller also has role() === null forever.
  role = signal<ConsoleUserRole | null>(null);
  private roleResolution: Promise<void> | null = null;

  currentUser = computed<CurrentUser | null>(() => {
    const s = this.session();
    if (!s) return null;
    const claims = decodeJwtPayload<IdTokenClaims>(s.idToken) ?? {};
    const name = claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || claims.preferred_username || 'Admin';
    const email = claims.email || claims.preferred_username || '';
    const initials = ((claims.given_name?.[0] ?? name[0] ?? '?') + (claims.family_name?.[0] ?? '')).toUpperCase();
    return { name, email, initials };
  });

  // Current authenticated user's Keycloak subject (UUID string) — used by backend APIs that require a userId.
  currentUserId = computed(() => {
    const s = this.session();
    if (!s) return null;
    const claims = decodeJwtPayload<Record<string, any>>(s.idToken) ?? {};
    return (claims['sub'] as string) ?? null;
  });

  getUserId(): string | null {
    return this.currentUserId();
  }

  getAccessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  constructor() {
    const s = this.session();
    if (!s) return;
    if (Date.now() - s.loginAt >= SESSION_TTL_MS) {
      this.clearSession();
    } else {
      this.scheduleTimers(s);
    }
  }

  async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: KEYCLOAK_CLIENT_ID,
      username,
      password,
      scope: 'openid profile email'
    });

    try {
      const response = await firstValueFrom(
        this.http.post<KeycloakTokenResponse>(TOKEN_URL, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      );
      this.persist({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        idToken: response.id_token,
        loginAt: Date.now()
      });

      // A valid Keycloak login only proves who this is, not that they're set up for THIS console —
      // that's a separate, console-only concept (see console-users backend). Denying it here, before
      // login() ever returns success, means every existing caller (just the login form today) gets
      // this for free without needing its own denial-handling branch.
      const hasRole = await this.ensureRoleResolved();
      if (!hasRole) {
        this.endSession();
        return { success: false, error: "Your account isn't set up for this console yet. Ask a super admin to add you." };
      }
      return { success: true };
    } catch (err: unknown) {
      const description = (err as { error?: KeycloakErrorResponse })?.error?.error_description;
      return { success: false, error: description || 'Invalid username or password' };
    }
  }

  // Resolves (and caches for the rest of this session) which role the signed-in Keycloak identity
  // has in THIS console, via the backend's own self-lookup on the bearer token already attached by
  // authInterceptor. Returns false for every failure mode — an explicit "not provisioned" 404 and a
  // transient network/5xx error look identical here on purpose: a backend hiccup must never silently
  // grant access just because it couldn't be checked.
  async ensureRoleResolved(): Promise<boolean> {
    if (this.role() !== null) return true;
    if (!this.roleResolution) {
      this.roleResolution = this.resolveRole();
    }
    await this.roleResolution;
    return this.role() !== null;
  }

  private async resolveRole(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<ConsoleUserMeResponse>(`${API_BASE_URL}/platform/console-users/me`));
      this.role.set(response.role);
    } catch (err) {
      console.error('Could not resolve console role — failing closed', err);
      this.role.set(null);
    } finally {
      this.roleResolution = null;
    }
  }

  async logout(): Promise<void> {
    const s = this.session();
    this.endSession();
    this.router.navigateByUrl('/login');

    if (!s?.refreshToken) return;

    const body = new URLSearchParams({ client_id: KEYCLOAK_CLIENT_ID, refresh_token: s.refreshToken });
    try {
      await firstValueFrom(
        this.http.post(LOGOUT_URL, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      );
    } catch (err) {
      console.error('Failed to revoke Keycloak session server-side (local session already cleared)', err);
    }
  }

  // Called by the route guard before entering a protected page: makes sure the access token behind
  // the session is still valid, silently refreshing it if it's expired or about to be — without
  // asking the user to log in again — up until the 24h session cap set at login.
  async ensureValidSession(): Promise<boolean> {
    const s = this.session();
    if (!s) return false;

    if (Date.now() - s.loginAt >= SESSION_TTL_MS) {
      await this.logout();
      return false;
    }

    if (Date.now() < accessTokenExpiry(s) - REFRESH_SKEW_MS) return true;
    return this.refreshAccessToken(s);
  }

  private async refreshAccessToken(s: StoredSession): Promise<boolean> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: KEYCLOAK_CLIENT_ID,
      refresh_token: s.refreshToken
    });

    try {
      const response = await firstValueFrom(
        this.http.post<KeycloakTokenResponse>(TOKEN_URL, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      );
      this.persist({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        idToken: response.id_token,
        loginAt: s.loginAt
      });
      return true;
    } catch (err) {
      console.error('Session refresh failed, signing out', err);
      await this.logout();
      return false;
    }
  }

  private persist(s: StoredSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    this.session.set(s);
    this.scheduleTimers(s);
  }

  private clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
    this.session.set(null);
  }

  // Full teardown of local session state, without the navigate-to-login or Keycloak revoke call
  // logout() also does — used by logout() itself and by callers (login()'s role-denial branch, the
  // route guard's role-denial branch) that need to discard a session without necessarily wanting
  // logout()'s own navigation, which would race with a redirect the caller is about to return itself.
  endSession(): void {
    this.clearTimers();
    this.clearSession();
    this.role.set(null);
    this.roleResolution = null;
  }

  private scheduleTimers(s: StoredSession): void {
    this.clearTimers();

    const msUntilCap = Math.max(s.loginAt + SESSION_TTL_MS - Date.now(), 0);
    this.expiryTimer = setTimeout(() => this.logout(), msUntilCap);

    const msUntilRefresh = Math.min(Math.max(accessTokenExpiry(s) - Date.now() - REFRESH_SKEW_MS, 0), msUntilCap);
    this.refreshTimer = setTimeout(() => this.refreshAccessToken(s), msUntilRefresh);
  }

  private clearTimers(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.refreshTimer = null;
    this.expiryTimer = null;
  }
}

function accessTokenExpiry(s: StoredSession): number {
  const claims = decodeJwtPayload<{ exp?: number }>(s.accessToken);
  return (claims?.exp ?? 0) * 1000;
}

function readStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}
