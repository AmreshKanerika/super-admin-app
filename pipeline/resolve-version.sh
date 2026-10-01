#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Resolve semantic image version from commit message prefixes since the last
# version tag, then append the build id to make the final tag immutable.
#
# Commit-message prefixes (first matching prefix wins):
#   major: ...   MAJOR bump   (1.2.3 -> 2.0.0)
#   feat:  ...   MINOR bump   (1.2.3 -> 1.3.0)
#   fix:   ...   PATCH bump   (1.2.3 -> 1.2.4)
#   <none>       PATCH bump (only if there are any new commits since last tag)
#
# Required env vars:
#   BUILD_BUILDID  - Azure DevOps build id (appended to BASE_VERSION)
#
# Outputs (pipeline variables, available to downstream stages):
#   BASE_VERSION   = <major>.<minor>.<patch>                    (e.g. 1.4.7)
#   IMAGE_VERSION  = <major>.<minor>.<patch>-<buildId>-<env>   (e.g. 1.4.7-5678-sit)
#   GIT_SHA_SHORT  = 7-char git sha
# -----------------------------------------------------------------------------
set -euo pipefail

echo "=================================================="
echo "VERSION DETECTION"
echo "=================================================="

LAST_TAG=$(git describe --tags --match "v[0-9]*.[0-9]*.[0-9]*" --abbrev=0 2>/dev/null || true)
HAS_TAG=true
if [ -z "${LAST_TAG}" ]; then
  LAST_TAG="v1.0.0"
  HAS_TAG=false
fi
echo "Last tag: ${LAST_TAG}"

CURRENT_VERSION="${LAST_TAG#v}"
IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT_VERSION}"
echo "Current version: ${MAJOR}.${MINOR}.${PATCH}"

if [ "${HAS_TAG}" = "false" ]; then
  COMMITS=$(git log --pretty=format:"%s" 2>/dev/null || echo "")
  echo "No previous tags found, analyzing all commits"
else
  COMMITS=$(git log "${LAST_TAG}..HEAD" --pretty=format:"%s" 2>/dev/null || echo "")
  COMMIT_COUNT=$(git rev-list "${LAST_TAG}..HEAD" --count 2>/dev/null || echo "0")
  echo "Analyzing ${COMMIT_COUNT} commit(s) since ${LAST_TAG}"
fi

BUMP_TYPE="none"
if echo "${COMMITS}" | grep -qE "^major:"; then
  BUMP_TYPE="major"
elif echo "${COMMITS}" | grep -qE "^feat:"; then
  BUMP_TYPE="minor"
elif echo "${COMMITS}" | grep -qE "^fix:"; then
  BUMP_TYPE="patch"
elif [ -n "${COMMITS}" ]; then
  BUMP_TYPE="patch"
fi
echo "Bump type: ${BUMP_TYPE}"

case "${BUMP_TYPE}" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

BASE_VERSION="${MAJOR}.${MINOR}.${PATCH}"
GIT_SHA_SHORT=$(git rev-parse --short HEAD)

if [[ "${BUILD_SOURCEBRANCH:-}" == "refs/heads/sit" ]]; then
  ENV_SUFFIX="sit"
else
  ENV_SUFFIX="dev"
fi

IMAGE_VERSION="${BASE_VERSION}-${BUILD_BUILDID}-${ENV_SUFFIX}"

echo ""
echo "=================================================="
echo "BUILD IDENTITY"
echo "  Base Version  : ${BASE_VERSION}"
echo "  Environment   : ${ENV_SUFFIX}"
echo "  Image Version : ${IMAGE_VERSION}"
echo "  Git SHA       : ${GIT_SHA_SHORT}"
echo "  Build ID      : ${BUILD_BUILDID}"
echo "=================================================="
echo ""
echo "Commit prefixes:  fix:->PATCH   feat:->MINOR   major:->MAJOR"

echo "##vso[task.setvariable variable=BASE_VERSION;isOutput=true]${BASE_VERSION}"
echo "##vso[task.setvariable variable=IMAGE_VERSION;isOutput=true]${IMAGE_VERSION}"
echo "##vso[task.setvariable variable=GIT_SHA_SHORT;isOutput=true]${GIT_SHA_SHORT}"
