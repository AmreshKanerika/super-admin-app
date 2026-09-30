# FLIP Platform Console

The FLIP Platform Console is Kanerika's internal web application for running the FLIP platform. Super admins and the sales team use it to onboard customer organizations, build subscription plans, manage the application catalog, administer each organization's users and roles, track renewals and offboard customers. The in-app **Help** page (`/help`) walks through each of these flows with screenshots.

This repository contains the **frontend only**: an Angular 18 single-page application served as static files by nginx. It holds no data or secrets. Every API call goes through **flip-gateway-app** to **flip-admin-app**, and users sign in against a dedicated Keycloak realm.

---

## Contents

- [Architecture](#architecture)
- [Environments](#environments)
- [Configuration](#configuration)
- [Build and deploy](#build-and-deploy)
- [Keycloak](#keycloak)
- [Platform prerequisites](#platform-prerequisites)
- [Release checklist](#release-checklist)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Project structure](#project-structure)

---

## Architecture

```
                       ┌───────────────────────────────┐
  Browser  ──────────▶ │ superadmin.<env>.flipnow.cloud │  nginx: static Angular bundle + env.js
     │                 └───────────────────────────────┘
     │  REST  (Authorization: Bearer <token>)
     ├───────────────▶ flip-gateway-app   <env>.flipnow.cloud/flip-admin/**
     │                       │  route "flip-admin-route" (UserRequestFilter):
     │                       │  checks the token is present and not expired,
     │                       │  adds domainPrefix / username headers
     │                       ▼
     │                 flip-admin-app     (internal: flip-admin-app:8085/flip-admin)
     │
     │  OpenID Connect token endpoint (sign in / refresh / sign out)
     └───────────────▶ Keycloak           realm flip-super-admin, client super-admin
```

- **Sign-in** is handled by the console's own login screen, which posts the username and password to the Keycloak token endpoint (direct access grant). Pages that Keycloak renders itself (password reset, email actions, errors) use the bundled [`flip-super-admin` login theme](#login-theme).
- **Authorization** is enforced by flip-admin-app: a valid Keycloak identity must also be a *console user* (Super admin or Sales) to get past the login screen.
- **The gateway is the only public entry point** to flip-admin-app. No gateway or backend code change is needed; the console uses the existing `/flip-admin/**` route.

## Environments

| Environment | Console URL | API (flip-gateway-app) | Keycloak | Build script |
| --- | --- | --- | --- | --- |
| DEV | `https://superadmin.dev.flipnow.cloud` | `https://dev.flipnow.cloud/flip-admin` | `https://sit-auth-admin.flipnow.cloud` | `npm run build:dev` |
| SIT | `https://superadmin.sit.flipnow.cloud` | `https://sit.flipnow.cloud/flip-admin` | `https://sit-auth-admin.flipnow.cloud` | `npm run build:sit` |
| PROD | `https://superadmin.flipnow.cloud` | `https://flipnow.cloud/flip-admin` | `https://auth-admin.flipnow.cloud` | `npm run build` |

DEV and SIT share one Keycloak; PROD has its own. In every environment the realm is `flip-super-admin` and the client is `super-admin`.

Non-production builds show an environment badge (DEV, SIT, LOCAL) beside the product name so nobody mistakes a test environment for production.

## Configuration

The console needs five public values. Configuration is resolved in two layers:

1. **Build time.** `src/environments/environment.<env>.ts`, selected by the build script through `angular.json` file replacements, supplies the defaults in the table above.
2. **Run time (optional).** When the container starts, `docker/40-flip-env.sh` writes `env.js` from the `FLIP_*` variables below. Any value set there overrides the build-time value, so **one image can be pointed at any server without a rebuild**. Unset variables keep the build-time value.

| Variable | Purpose | Example |
| --- | --- | --- |
| `FLIP_ENV_NAME` | Environment label; the badge is hidden for `PROD` | `SIT` |
| `FLIP_API_BASE_URL` | flip-gateway-app base URL, including `/flip-admin` | `https://sit.flipnow.cloud/flip-admin` |
| `FLIP_KEYCLOAK_BASE_URL` | Keycloak base URL, without `/realms/...` | `https://sit-auth-admin.flipnow.cloud` |
| `FLIP_KEYCLOAK_REALM` | Realm that holds console users | `flip-super-admin` |
| `FLIP_KEYCLOAK_CLIENT_ID` | Public client the console signs in with | `super-admin` |

> All of these values are delivered to the browser. **Never put secrets in them.**

To change an environment's defaults permanently, edit the two host constants at the top of its environment file (`GATEWAY_HOST`, `KEYCLOAK_HOST`).

## Build and deploy

### Container image

The multi-stage `Dockerfile` builds the bundle with Node 22 and serves it with nginx on port **80**. The `NPM_BUILD_SCRIPT` build argument chooses which environment file is baked in.

```bash
# SIT
docker build --build-arg NPM_BUILD_SCRIPT=build:sit -t flip-super-admin:sit .

# DEV
docker build --build-arg NPM_BUILD_SCRIPT=build:dev -t flip-super-admin:dev .

# PROD (default)
docker build -t flip-super-admin:prod .
```

Run it, optionally overriding any value at start-up:

```bash
docker run -d -p 8080:80 \
  -e FLIP_ENV_NAME=SIT \
  -e FLIP_API_BASE_URL=https://sit.flipnow.cloud/flip-admin \
  flip-super-admin:sit
```

The image includes:

- **SPA routing**: every route falls back to `index.html`.
- **Caching**: hashed bundles are cached for a year; `index.html` and `env.js` are never cached, so a release or a configuration change takes effect on the next page load.
- **Health endpoint**: `GET /healthz` returns `200 ok` for load-balancer, Docker and Kubernetes probes.
- **Security headers**: `X-Content-Type-Options` and `X-Frame-Options`. The `Referer` header is left at the browser default because flip-gateway-app reads it.

### Kubernetes / Azure

Deploy the image behind the environment's ingress with TLS for its console host, route `/` to container port 80, and use `/healthz` for liveness and readiness. Set `FLIP_*` variables in the deployment only when a value differs from the build.

### Static hosting (without Docker)

`npm run build:<env>` writes the site to `dist/super-admin/browser/`. Serve it from any static host with an `index.html` fallback for unknown paths. To override values without rebuilding, edit `env.js` in the output folder, for example:

```js
window.__env = { apiBaseUrl: 'https://sit.flipnow.cloud/flip-admin' };
```

## Keycloak

### Client `super-admin` (realm `flip-super-admin`)

| Setting | Value |
| --- | --- |
| Client authentication | Off (public client) |
| Direct access grants | **On** (the console's login screen uses the password grant) |
| Web origins | The console URL(s): `https://superadmin.dev.flipnow.cloud` and `https://superadmin.sit.flipnow.cloud` on the shared DEV/SIT Keycloak; `https://superadmin.flipnow.cloud` on the PROD Keycloak |

Web origins control CORS on the token and logout endpoints; without them the browser blocks sign-in. No redirect URIs are needed, because sign-in, refresh and sign-out are all background calls. A preflight check on 1 Oct 2026 showed both Keycloaks already accept the three console origins.

### Login theme

`keycloak-theme/` contains the **flip-super-admin** login theme. It extends Keycloak's `keycloak.v2` theme and restyles every page Keycloak renders for the realm (sign in, update password, forgot password, verify email and error pages) with the console's branding. It overrides only styles and wording, not templates, so it keeps working across Keycloak upgrades.

1. **Package** it (requires a JDK for the `jar` tool):

   ```bash
   npm run theme:package      # -> dist/flip-super-admin-keycloak-theme.jar
   ```

2. **Install** it on each Keycloak: copy the JAR to `/opt/keycloak/providers/` (or copy `keycloak-theme/theme/flip-super-admin` to `/opt/keycloak/themes/`), then restart or rebuild Keycloak (`kc.sh build` for optimized images).
3. **Apply** it once per Keycloak: **Realm settings → Themes → Login theme → `flip-super-admin`** in realm `flip-super-admin`. Organization realms are not affected.

## Platform prerequisites

These live outside this repository. Check them once per environment.

**flip-gateway-app**

- The `api_route` table contains `flip-admin-route`: path `/flip-admin/**` → `http://flip-admin-app:8085/flip-admin`, filter `UserRequestFilter`.
- CORS allows the console origin. `CORS_ALLOWED_ORIGINS_URLS` already covers `https://*.<env>.flipnow.cloud`; use `SUPER_ADMIN_CORS_ORIGINS` only if the console is served from another domain.

**flip-admin-app**

- `CONSOLE_KEYCLOAK_REALM=flip-super-admin`. It is used when console users are added from the console; the default (`kanerika-local`) is only correct for local development.
- `KEYCLOAK_AUTH_BASE_URL` points at the Keycloak that holds `flip-super-admin` for that environment.

**DNS / ingress (DevOps)**

- `superadmin.dev.flipnow.cloud`, `superadmin.sit.flipnow.cloud` and `superadmin.flipnow.cloud` resolve to the console deployment and serve HTTPS.

## Release checklist

- [ ] `npm run build:<env>` succeeds (budgets are enforced on DEV, SIT and PROD builds).
- [ ] Image built with the matching `NPM_BUILD_SCRIPT` and deployed.
- [ ] `GET https://<console-host>/healthz` returns `200`.
- [ ] `https://<console-host>/env.js` contains only the intended overrides (or `{}`).
- [ ] Sign in with a console user; the Overview page loads with no failed requests in the browser's network tab.
- [ ] The environment badge shows the expected name (none on PROD).

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Sign-in fails with a network or CORS error | Console origin missing from the client's Web origins | Add it to client `super-admin` (see [Keycloak](#keycloak)) |
| "Invalid username or password" for a known user | Wrong realm or Keycloak host for this environment | Check `keycloakBaseUrl` / `keycloakRealm` in `env.js` or the environment file |
| "Your account isn't set up for this console yet" | The Keycloak user is not a console user | Add them under **Console users** |
| API calls fail with CORS errors | Gateway CORS does not include the console origin | Set `SUPER_ADMIN_CORS_ORIGINS` on flip-gateway-app |
| API calls return 404 | Missing `/flip-admin/**` route in the gateway's `api_route` table | Add `flip-admin-route` |
| API calls return 401 or 403 | Token expired or missing | Sign in again; check that the clocks on the servers are in sync |
| Adding a console user fails | `CONSOLE_KEYCLOAK_REALM` not set on flip-admin-app | Set it to `flip-super-admin` |
| An old version still shows after a release | A proxy or CDN is caching `index.html` | Exclude `index.html` and `env.js` from CDN caching |

## Development

Requirements: Node.js 20+ and npm; flip-admin-app and Keycloak reachable locally.

```bash
npm install
npm start                    # http://localhost:1795, LOCAL environment
npm start -- -c sit          # serve against the SIT gateway and Keycloak
```

`src/environments/environment.ts` (LOCAL) calls flip-admin-app directly on `http://localhost:8085/flip-admin`. To go through a local flip-gateway-app instead, use `http://localhost:8081/flip-admin` and add `http://localhost:1795` to the gateway's `SUPER_ADMIN_CORS_ORIGINS`.

| Script | Purpose |
| --- | --- |
| `npm start` | Development server with live reload |
| `npm run build` / `build:sit` / `build:dev` | Optimized builds for PROD / SIT / DEV |
| `npm test` | Unit tests (Karma) |
| `npm run help:pdf` | Rebuild the downloadable Help PDF (`src/assets/help/flip-platform-console-user-guide.pdf`) from the Help content; needs Chrome 131+ (`CHROME_PATH` if it is not in a standard location) |
| `npm run theme:package` | Package the Keycloak login theme |

## Project structure

```
src/
  app/
    core/          Auth, HTTP interceptors, runtime configuration, layout, shared UI
    features/      One folder per screen: overview, organizations (incl. users & roles),
                   applications, plans, onboarding, notifications, offboarding,
                   audit-log, console-users, help
    services/      API clients for flip-admin-app
    models/        Shared TypeScript types
  assets/          Logos and Help screenshots
  environments/    Build-time configuration per environment
scripts/
  build-help-pdf.mjs  Generates the Help PDF from src/app/features/help/help-content.ts
public/
  env.js           Runtime configuration (rewritten by the container at start-up)
docker/
  40-flip-env.sh   Writes env.js from FLIP_* variables when the container starts
keycloak-theme/    Keycloak login theme "flip-super-admin"
Dockerfile         Multi-stage build: Node 22 → nginx
nginx.conf         SPA routing, caching, health endpoint, security headers
```
