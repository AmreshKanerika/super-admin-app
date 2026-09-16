// Runtime configuration for the deployed FLIP console.
//
// Loaded before the app bundle (see index.html), so it can redirect the frontend at a hosted
// backend WITHOUT rebuilding. Edit these to your deployed backend + Keycloak, or leave them to
// fall back to localhost for local development. This file must contain NO secrets - it is public.
window.__FLIP_CONFIG__ = {
  // e.g. "https://flip-admin.onrender.com/flip-admin"
  API_BASE_URL: 'http://localhost:8085/flip-admin',
  KEYCLOAK_BASE_URL: 'http://localhost:8080',
  KEYCLOAK_REALM: 'kanerika-local',
  KEYCLOAK_CLIENT_ID: 'super-admin'
};
