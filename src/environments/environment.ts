// Base config, used by `ng serve` / `ng build` with no --configuration (local dev).
// Each deployed environment REPLACES this file at build time via angular.json
// fileReplacements (environment.dev.ts / .sit.ts / .prod.ts). See README.
export const environment = {
  production: false,
  env: 'LOCAL',
  apiBaseUrl: 'http://localhost:8085/flip-admin',
  keycloakBaseUrl: 'http://localhost:8080',
  keycloakRealm: 'kanerika-local',
  keycloakClientId: 'super-admin',
};
