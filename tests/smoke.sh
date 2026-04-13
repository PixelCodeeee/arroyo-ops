#!/bin/bash
set -e

echo "Running Smoke Tests on Canary Deployment..."

# You must replace this with your actual GCLB external IP or domain when configuring pipelines.
# For example, https://api.arroyoseco.online
if [ -z "$1" ]; then
  LB_IP=$(gcloud compute addresses describe arroyo-global-ip --format="get(address)" --global --project=beta-prime-489121 2>/dev/null || echo "127.0.0.1")
  TARGET_URL="http://$LB_IP"
else
  TARGET_URL=$1
fi

# Example: Hitting an openly accessible endpoint checking health or catalog.
# The GCLB uses a cookie or header to split. If using a header: x-frontend-version: canary
echo "Targeting: $TARGET_URL/health"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "x-frontend-version: canary" "$TARGET_URL/health")

if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "🚨 Smoke test failed! Expected HTTP 200, got $HTTP_STATUS"
  exit 1
fi

echo "✅ Canay smoke test passed (HTTP 200)."
exit 0
