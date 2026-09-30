# ---- Stage 1: build the Angular app --------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund || npm install --force --no-audit --no-fund

COPY . .

# Which environment file is baked in: build (PROD, default), build:sit or build:dev.
# Every value can still be overridden when the container starts (FLIP_* variables below).
ARG NPM_BUILD_SCRIPT=build
RUN npm run "$NPM_BUILD_SCRIPT"

# ---- Stage 2: serve with nginx -------------------------------------------------------------
FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/super-admin/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Writes env.js from FLIP_ENV_NAME, FLIP_API_BASE_URL, FLIP_KEYCLOAK_BASE_URL,
# FLIP_KEYCLOAK_REALM and FLIP_KEYCLOAK_CLIENT_ID at start-up. Line endings are normalised in
# case the file was checked out on Windows.
COPY docker/40-flip-env.sh /docker-entrypoint.d/40-flip-env.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-flip-env.sh && chmod +x /docker-entrypoint.d/40-flip-env.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
