// Runtime configuration for the deployed FLIP super-admin console (Vercel).
// Loaded before the app bundle (see index.html); edit + redeploy to retarget. No secrets here.
window.__FLIP_CONFIG__ = {
  // flip-admin-app is internal (localhost:8085) in SIT, reached only via the gateway.
  // The gateway must route /flip-admin/** to it and allow this origin (CORS).
  API_BASE_URL: 'https://sit.flipnow.cloud/flip-admin',
  KEYCLOAK_BASE_URL: 'https://sit-auth-admin.flipnow.cloud',
  KEYCLOAK_REALM: 'flip-super-admin',
  KEYCLOAK_CLIENT_ID: 'super-admin'
};
