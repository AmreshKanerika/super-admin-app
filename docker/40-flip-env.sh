#!/bin/sh
# Runs at container start-up (nginx's /docker-entrypoint.d hook) and writes env.js from FLIP_*
# variables, so one image can be pointed at any gateway and Keycloak without a rebuild.
# Variables that are unset or empty keep the values built into the bundle.
set -eu

TARGET="${FLIP_ENV_JS_PATH:-/usr/share/nginx/html/env.js}"

# Escapes backslashes and double quotes for a JavaScript string literal.
escape() {
  printf '%s' "$1" | sed -e 's/[\\"]/\\&/g'
}

entry() {
  if [ -n "$2" ]; then
    printf '  %s: "%s",\n' "$1" "$(escape "$2")"
  fi
}

{
  echo "// Generated at container start-up by 40-flip-env.sh. Public values only."
  echo "window.__env = {"
  entry env "${FLIP_ENV_NAME:-}"
  entry apiBaseUrl "${FLIP_API_BASE_URL:-}"
  entry keycloakBaseUrl "${FLIP_KEYCLOAK_BASE_URL:-}"
  entry keycloakRealm "${FLIP_KEYCLOAK_REALM:-}"
  entry keycloakClientId "${FLIP_KEYCLOAK_CLIENT_ID:-}"
  echo "};"
} > "$TARGET"

echo "40-flip-env.sh: wrote $TARGET"
