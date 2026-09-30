// Runtime configuration. The Docker image rewrites this file at container start-up from
// FLIP_* environment variables (docker/40-flip-env.sh). Keys left out keep the values built
// into the bundle, so an empty object means "use the build's environment file".
// This file is public — never put secrets in it.
window.__env = window.__env || {};
