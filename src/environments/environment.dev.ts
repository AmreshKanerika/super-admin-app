// DEV — console served at https://superadmin.dev.flipnow.cloud
// API calls go through flip-gateway-app; sign-in goes straight to Keycloak.
// To retarget DEV, change the two hosts below. A running container can also override
// every value without a rebuild through FLIP_* variables (see README → Configuration).
import { AppEnvironment } from './environment.model';

const GATEWAY_HOST = 'https://dev.flipnow.cloud'; // flip-gateway-app — its /flip-admin/** route forwards to flip-admin-app
const KEYCLOAK_HOST = 'https://sit-auth-admin.flipnow.cloud'; // DEV and SIT share one Keycloak

export const environment: AppEnvironment = {
  production: true,
  env: 'DEV',
  apiBaseUrl: `${GATEWAY_HOST}/flip-admin`,
  keycloakBaseUrl: KEYCLOAK_HOST,
  keycloakRealm: 'flip-super-admin',
  keycloakClientId: 'super-admin'
};
