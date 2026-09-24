// Base config, used by `ng serve` / `ng build` with no --configuration (local dev).
// Each deployed environment REPLACES this file at build time via angular.json
// fileReplacements (environment.dev.ts / .sit.ts / .prod.ts). See README.
//
// TEMPORARY: local UI + local flip-admin-app, but SIT Keycloak (realm flip-super-admin).
// Original local values are kept below - restore them before committing.
export const environment = {
  production: false,
  env: 'LOCAL-SIT',
  apiBaseUrl: 'http://localhost:8085/flip-admin',
  keycloakBaseUrl: 'https://sit-auth-admin.flipnow.cloud',
  keycloakRealm: 'flip-super-admin',
  keycloakClientId: 'super-admin',
};

// Local-only values (restore these):
// export const environment = {
//   production: false,
//   env: 'LOCAL',
//   apiBaseUrl: 'http://localhost:8085/flip-admin',
//   keycloakBaseUrl: 'http://localhost:8080',
//   keycloakRealm: 'kanerika-local',
//   keycloakClientId: 'super-admin',
// };
