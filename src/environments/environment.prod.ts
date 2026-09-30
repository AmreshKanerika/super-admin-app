// PRODUCTION — https://superadmin.flipnow.cloud
// >>> To point this environment somewhere else, change ONLY the two hosts below. <<<
const GATEWAY_HOST = 'https://flipnow.cloud';            // serves /flip-admin (flip-admin-app via gateway)
const KEYCLOAK_HOST = 'https://auth-admin.flipnow.cloud';      // Keycloak base URL for PROD

export const environment = {
  production: true,
  env: 'PROD',
  apiBaseUrl: 'http://localhost:8085/flip-admin',
  keycloakBaseUrl: 'https://auth-admin.flipnow.cloud',
  keycloakRealm: 'flip-super-admin',
  keycloakClientId: 'super-admin',
};

