#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Free up disk space on the agent before a large Docker build.
# Hosted Ubuntu agents start with ~14GB free; a full Angular build + nginx
# stage can consume meaningful space.
# -----------------------------------------------------------------------------
set -euo pipefail

echo "Disk before cleanup:"
df -h /

docker system prune -af --volumes >/dev/null 2>&1 || true

echo "Disk after cleanup:"
df -h /
