#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Post an Adaptive Card to a Teams channel via a Power Automate Workflows
# "Post to a channel when a webhook request is received" URL.
#
# Required env vars:
#   TEAMS_WEBHOOK_URL     - Workflows webhook URL (mark as secret in ADO)
#   STATUS_TEXT           - "Succeeded" or "Failed"
#   ENVIRONMENT           - dev/sit/prod
#   DEPLOYMENT_NAME, IMAGE_NAME, IMAGE_VERSION, GIT_SHA_SHORT
#   NAMESPACE, AKS_CLUSTER
#   BUILD_BUILDID, SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT
# -----------------------------------------------------------------------------
set -euo pipefail

if [ -z "${TEAMS_WEBHOOK_URL:-}" ]; then
  echo "TEAMS_WEBHOOK_URL not set; skipping Teams notification."
  exit 0
fi

COLOR="Good"
[ "${STATUS_TEXT}" = "Failed" ] && COLOR="Attention"

BUILD_URL="${SYSTEM_COLLECTIONURI}${SYSTEM_TEAMPROJECT}/_build/results?buildId=${BUILD_BUILDID}"

payload=$(cat <<JSON
{
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "content": {
      "type": "AdaptiveCard",
      "\$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4",
      "body": [
        {
          "type": "TextBlock",
          "size": "Large",
          "weight": "Bolder",
          "text": "Deploy ${STATUS_TEXT} — ${DEPLOYMENT_NAME} (${ENVIRONMENT})",
          "color": "${COLOR}",
          "wrap": true
        },
        {
          "type": "FactSet",
          "facts": [
            {"title": "Image",     "value": "${IMAGE_NAME}:${IMAGE_VERSION}"},
            {"title": "Git SHA",   "value": "${GIT_SHA_SHORT}"},
            {"title": "Namespace", "value": "${NAMESPACE}"},
            {"title": "Cluster",   "value": "${AKS_CLUSTER}"},
            {"title": "Build",     "value": "#${BUILD_BUILDID}"}
          ]
        }
      ],
      "actions": [
        {"type": "Action.OpenUrl", "title": "Open Build", "url": "${BUILD_URL}"}
      ]
    }
  }]
}
JSON
)

http_code=$(curl -sS -o /tmp/teams-resp.txt -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  --data "${payload}" "${TEAMS_WEBHOOK_URL}")

echo "Teams webhook responded with HTTP ${http_code}"
if [ "${http_code}" -ge 400 ]; then
  cat /tmp/teams-resp.txt || true
  exit 1
fi
