// DEVELOPMENT — https://superadmin.dev.flipnow.cloud
// >>> To point this environment somewhere else, change ONLY the two hosts below. <<<
const GATEWAY_HOST = 'https://dev.flipnow.cloud';        // serves /flip-admin (flip-admin-app via gateway)
const KEYCLOAK_HOST = 'https://auth.dev.flipnow.cloud';  // Keycloak base URL for DEV

export const environment = {
  production: false,
  env: 'DEV',
  apiBaseUrl: `${GATEWAY_HOST}/flip-admin`,
  keycloakBaseUrl: KEYCLOAK_HOST,
  keycloakRealm: 'flip',
  keycloakClientId: 'super-admin',
};
