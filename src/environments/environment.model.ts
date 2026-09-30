/** Shape of every environment file. Values here are public — never put secrets in them. */
export interface AppEnvironment {
  production: boolean;
  /** Short name shown in the console so people know which environment they are in (LOCAL, DEV, SIT, PROD). */
  env: string;
  /** flip-admin-app base URL, including its context path (/flip-admin). */
  apiBaseUrl: string;
  /** Keycloak base URL, without /realms/…. */
  keycloakBaseUrl: string;
  /** Keycloak realm that holds console users. */
  keycloakRealm: string;
  /** Public Keycloak client the console signs in with. */
  keycloakClientId: string;
}
