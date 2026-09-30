// LOCAL — used by `npm start` / `ng serve` with no --configuration.
// Deployed builds replace this file through angular.json fileReplacements:
// environment.dev.ts, environment.sit.ts or environment.prod.ts.
import { AppEnvironment } from './environment.model';

// export const environment: AppEnvironment = {
//   production: false,
//   env: 'LOCAL',
//   // Straight to flip-admin-app. To go through a local flip-gateway-app instead, use
//   // 'http://localhost:8081/flip-admin' and add http://localhost:1795 to the gateway's SUPER_ADMIN_CORS_ORIGINS.
//   apiBaseUrl: 'http://localhost:8085/flip-admin',
//   keycloakBaseUrl: 'http://localhost:8080',
//   keycloakRealm: 'kanerika-local',
//   keycloakClientId: 'super-admin'
// };


const GATEWAY_HOST = 'http://localhost:8081'; // flip-gateway-app — its /flip-admin/** route forwards to flip-admin-app
const KEYCLOAK_HOST = 'https://sit-auth-admin.flipnow.cloud'; // DEV and SIT share one Keycloak

export const environment: AppEnvironment = {
  production: true,
  env: 'SIT',
  apiBaseUrl: `${GATEWAY_HOST}/flip-admin`,
  keycloakBaseUrl: KEYCLOAK_HOST,
  keycloakRealm: 'flip-super-admin',
  keycloakClientId: 'super-admin'
};

