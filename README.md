# FLIP Platform Console — Super Admin

The web console for the FLIP platform: onboard and offboard organizations, build
subscription plans, manage per-organization application access and usage limits,
handle subscriptions, and review the audit log.

This is the **frontend only** — a standalone Angular 18 single-page app. It talks
to the `flip-admin-app` Spring Boot backend over HTTP; it holds no data and no
secrets of its own.

## Tech stack

- **Angular 18** (standalone components, signals)
- TypeScript, SCSS
- Builds to a static bundle — deployable to any static host (Vercel, Netlify, S3, …)

## Prerequisites

- Node.js 18.19+ (or 20+) and npm
- The `flip-admin-app` backend running and reachable (default `http://localhost:8085/flip-admin`)
- Keycloak running for authentication (default `http://localhost:8080`)

## Local development

```bash
npm install
npm start
```

The dev server runs at `http://localhost:4200` and rebuilds on save.

## Configuration (no rebuild required)

Backend and Keycloak URLs are read at **runtime** from
[`public/config.js`](public/config.js), not baked into the bundle. Edit that one
file to point the app at a different backend, and reload — no rebuild:

```js
window.__FLIP_CONFIG__ = {
  API_BASE_URL: 'http://localhost:8085/flip-admin',
  KEYCLOAK_BASE_URL: 'http://localhost:8080',
  KEYCLOAK_REALM: 'kanerika-local',
  KEYCLOAK_CLIENT_ID: 'super-admin'
};
```

If the file or a value is absent, the app falls back to the localhost defaults in
[`src/app/core/api-config.ts`](src/app/core/api-config.ts). **`config.js` is
public — never put secrets in it.**

## Build

```bash
npm run build
```

Output goes to `dist/super-admin/browser/`.

## Deploying to Vercel

The repo includes [`vercel.json`](vercel.json), which sets the build command, the
Angular 18 output directory, and the single-page-app routing fallback. To deploy:

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com): **Add New → Project**, import the repo, and
   click **Deploy**. The settings are picked up from `vercel.json` automatically.

> **The backend does not run on Vercel.** Vercel serves this static frontend only.
> The Spring Boot backend, PostgreSQL, and Keycloak must be hosted elsewhere
> (e.g. Render, Railway, or Azure). Until then a Vercel deploy will load but its
> API calls will fail, because `config.js` still points at `localhost`. Once the
> backend is hosted, update `public/config.js` to its URL and redeploy.

## Project layout

```
src/app/
  core/        Auth, HTTP interceptors, shared UI, design tokens, utilities
  features/    One folder per screen (overview, organizations, plans,
               subscriptions, limits, offboarding, notifications, audit-log,
               console-users, onboarding, auth)
  services/    Typed clients for the backend API
public/        Static assets copied to the site root (incl. config.js)
```

## Tests

```bash
npm test
```
