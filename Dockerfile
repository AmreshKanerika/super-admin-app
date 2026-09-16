# Stage 1: build the Angular app
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install --force

COPY . .

# The environment is chosen at BUILD time via Angular fileReplacements, so each
# server gets its own build from the SAME image definition — only the build
# script differs (nothing else, and the runtime port is always 80):
#   build (default) -> production, build:sit -> SIT, build:dev -> DEV
ARG NPM_BUILD_SCRIPT=build
RUN npm run "$NPM_BUILD_SCRIPT"

# Stage 2: serve with nginx
FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
# Angular 18 application builder emits the site under dist/<project>/browser
COPY --from=build /app/dist/super-admin/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
