// Backend and Keycloak endpoints.
//
// 1. Build time: the environment file for the build (src/environments/environment.<env>.ts,
//    chosen by angular.json fileReplacements) supplies every value.
// 2. Run time: a deployment can override any value without rebuilding. The container writes
//    env.js (window.__env) at start-up from FLIP_* variables; see docker/40-flip-env.sh.
//    Anything env.js leaves out keeps its build-time value.
import { environment } from '../../environments/environment';

interface RuntimeEnv {
  env?: string;
  apiBaseUrl?: string;
  keycloakBaseUrl?: string;
  keycloakRealm?: string;
  keycloakClientId?: string;
}

const runtime: RuntimeEnv = (globalThis as { __env?: RuntimeEnv }).__env ?? {};

function pick(override: string | undefined, fallback: string): string {
  const value = override?.trim() ? override.trim() : fallback;
  return value.replace(/\/+$/, '');
}

export const ENV_NAME = pick(runtime.env, environment.env).toUpperCase();
export const API_BASE_URL = pick(runtime.apiBaseUrl, environment.apiBaseUrl);
export const KEYCLOAK_BASE_URL = pick(runtime.keycloakBaseUrl, environment.keycloakBaseUrl);
export const KEYCLOAK_REALM = pick(runtime.keycloakRealm, environment.keycloakRealm);
export const KEYCLOAK_CLIENT_ID = pick(runtime.keycloakClientId, environment.keycloakClientId);
