// PRODUCTION — https://superadmin.flipnow.cloud
// >>> To point this environment somewhere else, change ONLY the two hosts below. <<<
const GATEWAY_HOST = 'https://flipnow.cloud';            // serves /flip-admin (flip-admin-app via gateway)
const KEYCLOAK_HOST = 'https://auth.flipnow.cloud';      // Keycloak base URL for PROD

export const environment = {
  production: true,
  env: 'PROD',
  apiBaseUrl: `${GATEWAY_HOST}/flip-admin`,
  keycloakBaseUrl: KEYCLOAK_HOST,
  keycloakRealm: 'flip',
  keycloakClientId: 'super-admin',
};
