// Runtime-overridable configuration.
//
// These used to be hard-coded to localhost, which meant a deployed build (e.g. on Vercel) could
// only ever talk to a backend on the viewer's own machine. They now read from a global that a
// small, un-bundled `config.js` sets at page load (see src/index.html and public/config.js), so
// the SAME build can be pointed at a real backend by editing that one file - no rebuild. When the
// global is absent (plain `ng serve`, tests), the localhost defaults below apply.
interface FlipRuntimeConfig {
  API_BASE_URL?: string;
  KEYCLOAK_BASE_URL?: string;
  KEYCLOAK_REALM?: string;
  KEYCLOAK_CLIENT_ID?: string;
}

const runtime: FlipRuntimeConfig =
  (typeof window !== 'undefined' && (window as unknown as { __FLIP_CONFIG__?: FlipRuntimeConfig }).__FLIP_CONFIG__) || {};

export const API_BASE_URL = runtime.API_BASE_URL ?? 'http://localhost:8085/flip-admin';
export const KEYCLOAK_BASE_URL = runtime.KEYCLOAK_BASE_URL ?? 'http://localhost:8080';
export const KEYCLOAK_REALM = runtime.KEYCLOAK_REALM ?? 'kanerika-local';
export const KEYCLOAK_CLIENT_ID = runtime.KEYCLOAK_CLIENT_ID ?? 'super-admin';
