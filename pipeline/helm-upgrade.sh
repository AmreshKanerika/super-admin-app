#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Helm install/upgrade the service onto AKS using the immutable image tag.
# We deliberately do NOT pass --wait here; the next step (wait-rollout.sh)
# is the explicit failure gate so we fully control the failure path.
#
# DEV uses the chart's own values.yaml (single source). SIT layers an env file
# on top via VALUES_FILE and overrides the image repo via IMAGE_REPO (the SIT
# image lives in a different ACR — see promote-image-sit.sh). No Key Vault wiring.
#
# Required env vars:
#   DEPLOYMENT_NAME    - helm release + k8s deployment name
#   NAMESPACE          - target k8s namespace
#   HELM_CHART_DIR     - path to the unpacked helm chart
#   IMAGE_VERSION      - immutable image tag
#   ACR_LOGIN_SERVER   - for the display banner only
#   IMAGE_NAME         - for the display banner only
#   ENVIRONMENT        - human-readable env name (dev/sit/prod)
#
# Optional env vars:
#   VALUES_FILE        - extra values file layered on top (e.g. sit-values.yaml)
#   IMAGE_REPO         - override image.repository (e.g. SIT ACR login server/flip-super-admin-app)
# -----------------------------------------------------------------------------
set -euo pipefail

EXTRA_ARGS=()
if [ -n "${VALUES_FILE:-}" ]; then
  EXTRA_ARGS+=( -f "${VALUES_FILE}" )
fi
if [ -n "${IMAGE_REPO:-}" ]; then
  EXTRA_ARGS+=( --set image.repository="${IMAGE_REPO}" )
fi

echo "=================================================="
echo "Deploying ${DEPLOYMENT_NAME}"
echo "  Environment   : ${ENVIRONMENT}"
echo "  Namespace     : ${NAMESPACE}"
echo "  Image         : ${IMAGE_REPO:-${ACR_LOGIN_SERVER}/${IMAGE_NAME}}:${IMAGE_VERSION}"
echo "  Chart path    : ${HELM_CHART_DIR}"
echo "  Values file   : ${VALUES_FILE:-<chart default>}"
echo "=================================================="

helm upgrade --install "${DEPLOYMENT_NAME}" "${HELM_CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  "${EXTRA_ARGS[@]}" \
  --set image.tag="${IMAGE_VERSION}" \
  --set image.pullPolicy=IfNotPresent \
  --history-max 10
