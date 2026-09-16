// Backend + Keycloak endpoints, selected at BUILD time from the environment file
// (src/environments/environment.<env>.ts) via angular.json fileReplacements —
// the same pattern flip-ui uses. To retarget an environment, edit the host in its
// environment file; nothing here changes.
import { environment } from '../../environments/environment';

export const API_BASE_URL = environment.apiBaseUrl;
export const KEYCLOAK_BASE_URL = environment.keycloakBaseUrl;
export const KEYCLOAK_REALM = environment.keycloakRealm;
export const KEYCLOAK_CLIENT_ID = environment.keycloakClientId;
