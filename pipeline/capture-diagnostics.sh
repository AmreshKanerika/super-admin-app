#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Capture EVERYTHING a developer needs to debug a failed deploy:
#   - pod state (CrashLoopBackOff / ImagePullBackOff / OOMKilled / ...)
#   - kubectl describe pod (Events section is usually the smoking gun)
#   - current container logs
#   - PREVIOUS container logs (the crashed one — usually THE answer)
#   - recent namespace events
#   - actual applied deployment YAML
#
# Required env vars:
#   NAMESPACE, DEPLOYMENT_NAME, OUT_DIR, ACR_LOGIN_SERVER, IMAGE_NAME, IMAGE_VERSION
#
# Uses `set +e` and ends with `exit 0` so this step itself does not fail.
# -----------------------------------------------------------------------------
set +e

mkdir -p "${OUT_DIR}"
echo "Collecting pod diagnostics into ${OUT_DIR}"

kubectl get pods -n "${NAMESPACE}" -l "app=${DEPLOYMENT_NAME}" -o wide \
  | tee "${OUT_DIR}/pods.txt"

kubectl describe deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}" \
  > "${OUT_DIR}/describe-deployment.txt"

PODS=$(kubectl get pods -n "${NAMESPACE}" -l "app=${DEPLOYMENT_NAME}" \
  -o jsonpath='{.items[*].metadata.name}')

for POD in ${PODS}; do
  kubectl describe pod "${POD}" -n "${NAMESPACE}" \
    > "${OUT_DIR}/describe-${POD}.txt"

  kubectl logs "${POD}" -n "${NAMESPACE}" --all-containers --tail=500 \
    > "${OUT_DIR}/logs-current-${POD}.txt" 2>&1

  kubectl logs "${POD}" -n "${NAMESPACE}" --all-containers --previous --tail=500 \
    > "${OUT_DIR}/logs-previous-${POD}.txt" 2>&1
done

kubectl get events -n "${NAMESPACE}" --sort-by=.lastTimestamp \
  > "${OUT_DIR}/events.txt"

kubectl get deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}" -o yaml \
  > "${OUT_DIR}/deployment.yaml"

echo ""
echo "=================================================="
echo "DEPLOY FAILED — Diagnostics Summary"
echo "=================================================="
echo "Image attempted : ${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_VERSION}"
echo ""
echo "--- Pod status ---"
cat "${OUT_DIR}/pods.txt"
echo ""
echo "--- Pod state reasons ---"
kubectl get pods -n "${NAMESPACE}" -l "app=${DEPLOYMENT_NAME}" \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[*].state}{"\n"}{end}'
echo ""
echo "--- Recent events (last 20) ---"
tail -n 20 "${OUT_DIR}/events.txt"
echo ""
for POD in ${PODS}; do
  echo "--- Previous logs (crashed container): ${POD} ---"
  tail -n 50 "${OUT_DIR}/logs-previous-${POD}.txt"
  echo ""
done
echo "=================================================="
echo "Full diagnostics: download artifact 'pod-diagnostics' from this run."
echo "=================================================="

exit 0
