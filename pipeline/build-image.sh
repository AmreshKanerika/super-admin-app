#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Build & push the docker image with Buildx, ACR registry layer cache, and
# --pull so the base image is always fresh.
#
# Required env vars:
#   ACR_LOGIN_SERVER    - e.g. flipdocker-xxx.azurecr.io
#   IMAGE_NAME          - e.g. flip-super-admin-app
#   IMAGE_VERSION       - immutable tag (semver-buildId)
#   GIT_SHA_SHORT       - 7-char git sha
#   CACHE_TAG           - tag used for buildx registry cache (e.g. buildcache)
#   DOCKERFILE_PATH     - path to Dockerfile
#
# Auto-set by Azure DevOps:
#   BUILD_REPOSITORY_URI, BUILD_BUILDID, SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT,
#   BUILD_SOURCEBRANCH
#
# Prereqs: `az acr login --name <ACR_NAME>` already ran in a prior step.
# -----------------------------------------------------------------------------
set -euo pipefail

IMG="${ACR_LOGIN_SERVER}/${IMAGE_NAME}"
CACHE_REF="${IMG}:${CACHE_TAG}"

# Angular bakes env config at build time, so each branch builds its own config:
#   development -> npm run build:dev, release/sit -> npm run build:sit,
#   anything else -> npm run build (production).
case "${BUILD_SOURCEBRANCH:-}" in
  refs/heads/development)  NPM_BUILD_SCRIPT="build:dev" ;;
  refs/heads/sit)          NPM_BUILD_SCRIPT="build:sit" ;;
  *)                       NPM_BUILD_SCRIPT="${NPM_BUILD_SCRIPT:-build}" ;;
esac
echo "Angular build script: npm run ${NPM_BUILD_SCRIPT}"

echo "Setting up Docker Buildx builder..."
docker buildx create --use --name flip-builder --driver docker-container >/dev/null 2>&1 || \
  docker buildx use flip-builder
docker buildx inspect --bootstrap >/dev/null
docker buildx version

echo ""
echo "Building & pushing: ${IMG}:${IMAGE_VERSION}"
echo "Cache ref         : ${CACHE_REF}"
echo ""

docker buildx build \
  --pull \
  --build-arg NPM_BUILD_SCRIPT="${NPM_BUILD_SCRIPT}" \
  -t "${IMG}:${IMAGE_VERSION}" \
  -f "${DOCKERFILE_PATH}" \
  --cache-from "type=registry,ref=${CACHE_REF}" \
  --cache-to   "type=registry,ref=${CACHE_REF},mode=max" \
  --label "org.opencontainers.image.revision=${GIT_SHA_SHORT}" \
  --label "org.opencontainers.image.source=${BUILD_REPOSITORY_URI}" \
  --label "org.opencontainers.image.version=${IMAGE_VERSION}" \
  --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --label "build.id=${BUILD_BUILDID}" \
  --label "build.url=${SYSTEM_COLLECTIONURI}${SYSTEM_TEAMPROJECT}/_build/results?buildId=${BUILD_BUILDID}" \
  --provenance=false \
  --push \
  .
