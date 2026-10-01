#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Write a Markdown summary for the Azure DevOps run Summary tab with
# clickable deep links to Container Insights, Workloads, and Log Analytics.
#
# Required env vars:
#   SUMMARY_PATH, STATUS_TEXT, ENVIRONMENT
#   ACR_LOGIN_SERVER, IMAGE_NAME, IMAGE_VERSION
#   GIT_SHA_SHORT, NAMESPACE, AKS_CLUSTER, DEPLOYMENT_NAME
#   BUILD_BUILDID, SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT
#   INSIGHTS_URL, WORKLOADS_URL, LOGS_URL
# -----------------------------------------------------------------------------
set -euo pipefail

cat > "${SUMMARY_PATH}" <<EOF
## Deploy ${STATUS_TEXT} — ${DEPLOYMENT_NAME} (${ENVIRONMENT})

| Field | Value |
|---|---|
| Image | \`${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_VERSION}\` |
| Git SHA | \`${GIT_SHA_SHORT}\` |
| Namespace | \`${NAMESPACE}\` |
| Cluster | \`${AKS_CLUSTER}\` |
| Build | [#${BUILD_BUILDID}](${SYSTEM_COLLECTIONURI}${SYSTEM_TEAMPROJECT}/_build/results?buildId=${BUILD_BUILDID}) |

### Where to check pod logs

- **Container Insights (visual)** → [Open AKS Insights](${INSIGHTS_URL})
- **Live pod logs / workloads view** → [Open Workloads](${WORKLOADS_URL})
- **Log Analytics (KQL, persists after pod deletion)** → [Open Logs](${LOGS_URL})

Suggested KQL once in Log Analytics:

\`\`\`kql
ContainerLogV2
| where PodNamespace == "${NAMESPACE}"
| where PodName startswith "${DEPLOYMENT_NAME}"
| where TimeGenerated > ago(1h)
| project TimeGenerated, PodName, ContainerName, LogMessage
| order by TimeGenerated desc
\`\`\`

\`\`\`kql
KubeEvents
| where Namespace == "${NAMESPACE}"
| where Reason in ("Failed","BackOff","Unhealthy","OOMKilled","FailedScheduling")
| order by TimeGenerated desc
\`\`\`
EOF

if [ "${STATUS_TEXT}" = "Failed" ]; then
  cat >> "${SUMMARY_PATH}" <<EOF

### Failure diagnostics
Download the **pod-diagnostics** artifact on this run for:
- \`describe-*.txt\` — Events section shows OOMKilled / ImagePullBackOff / CrashLoopBackOff cause
- \`logs-previous-*.txt\` — logs from the **crashed** container (usually the answer)
- \`events.txt\` — namespace events around the failure
EOF
fi

echo "##vso[task.uploadsummary]${SUMMARY_PATH}"
