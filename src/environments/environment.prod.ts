// PROD — console served at https://superadmin.flipnow.cloud
// API calls go through flip-gateway-app; sign-in goes straight to Keycloak.
// To retarget PROD, change the two hosts below. A running container can also override
// every value without a rebuild through FLIP_* variables (see README → Configuration).
import { AppEnvironment } from './environment.model';

const GATEWAY_HOST = 'https://flipnow.cloud'; // flip-gateway-app — its /flip-admin/** route forwards to flip-admin-app
const KEYCLOAK_HOST = 'https://auth-admin.flipnow.cloud'; // PROD has its own Keycloak

export const environment: AppEnvironment = {
  production: true,
  env: 'PROD',
  apiBaseUrl: `${GATEWAY_HOST}/flip-admin`,
  keycloakBaseUrl: KEYCLOAK_HOST,
  keycloakRealm: 'flip-super-admin',
  keycloakClientId: 'super-admin'
};
