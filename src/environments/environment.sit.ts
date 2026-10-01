// SIT — https://superadmin.sit.flipnow.cloud
// >>> To point this environment somewhere else, change ONLY the two hosts below. <<<
const GATEWAY_HOST = 'https://sit.flipnow.cloud';        // serves /flip-admin (flip-admin-app via gateway)
const KEYCLOAK_HOST = 'https://sit-auth-admin.flipnow.cloud';  // Keycloak base URL for SIT

export const environment = {
  production: true,
  env: 'SIT',
  apiBaseUrl: `${GATEWAY_HOST}/flip-admin`,
  keycloakBaseUrl: KEYCLOAK_HOST,
  keycloakRealm: 'flip',
  keycloakClientId: 'super-admin',
};
