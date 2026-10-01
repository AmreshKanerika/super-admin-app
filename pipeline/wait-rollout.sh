#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Block until the deployment's pods are Ready. This is THE failure gate:
# exits 0 when all pods are Ready, non-zero on timeout or rollout failure.
#
# Required env vars:
#   DEPLOYMENT_NAME    - k8s deployment to watch
#   NAMESPACE          - target k8s namespace
#   ROLLOUT_TIMEOUT    - kubectl timeout string (e.g. "10m")
# -----------------------------------------------------------------------------
set -euo pipefail

echo "Gating on rollout — timeout ${ROLLOUT_TIMEOUT}"

kubectl rollout status "deployment/${DEPLOYMENT_NAME}" \
  -n "${NAMESPACE}" \
  --timeout="${ROLLOUT_TIMEOUT}"
