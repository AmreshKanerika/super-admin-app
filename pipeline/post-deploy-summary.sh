#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# On rollout success: print what's actually running + portal links.
# Required env vars:
#   DEPLOYMENT_NAME, NAMESPACE, INSIGHTS_URL, WORKLOADS_URL, LOGS_URL
# -----------------------------------------------------------------------------
set -euo pipefail

echo "=================================================="
echo "Deploy succeeded"
echo "=================================================="

kubectl get deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}" \
  -o jsonpath='Image: {.spec.template.spec.containers[0].image}{"\n"}'

kubectl get pods -n "${NAMESPACE}" -l "app=${DEPLOYMENT_NAME}" -o wide

echo ""
echo "Portal links:"
echo "  AKS Insights : ${INSIGHTS_URL}"
echo "  Live logs    : ${WORKLOADS_URL}"
echo "  KQL logs     : ${LOGS_URL}"
