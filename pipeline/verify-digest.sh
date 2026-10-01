#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Verify the image was actually pushed to ACR by reading its manifest digest.
# Catches silent push failures.
#
# Required env vars:
#   ACR_NAME           - ACR registry name (without .azurecr.io)
#   ACR_LOGIN_SERVER   - full login server (for display only)
#   IMAGE_NAME         - image repo name
#   IMAGE_VERSION      - tag to verify
#
# Prereqs: must run inside an AzureCLI@2 task so `az` is authenticated.
# -----------------------------------------------------------------------------
set -euo pipefail

DIGEST=$(az acr repository show \
  --name "${ACR_NAME}" \
  --image "${IMAGE_NAME}:${IMAGE_VERSION}" \
  --query "digest" -o tsv)

echo "=================================================="
echo "Pushed image verified"
echo "  Repo   : ${ACR_LOGIN_SERVER}/${IMAGE_NAME}"
echo "  Tag    : ${IMAGE_VERSION}"
echo "  Digest : ${DIGEST}"
echo "=================================================="

echo "##vso[task.setvariable variable=IMAGE_DIGEST]${DIGEST}"
