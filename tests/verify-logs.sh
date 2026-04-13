#!/bin/bash
set -e

echo "Verifying GCP Logs for Canary 5xx errors..."

# Wait 5 minutes before checking (can be handled via GitHub Actions sleep step, but included here for safety if run standalone)
# sleep 300

PROJECT_ID=${1:-"arroyo-seco-project"} # Replace with your real GCP Project ID
BACKEND_SERVICE_NAME="arroyo-backend-service"

# We look back 5 minutes
TIMESTAMP=$(date -u -d '5 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')

# Querying GCP Logging. This assumes gcloud is pre-authenticated in CI/CD via gcp_credentials.
# We are looking for 5xx errors from the canary backend specifically.
QUERY="resource.type=\"http_load_balancer\" \
resource.labels.backend_service_name=\"$BACKEND_SERVICE_NAME\" \
httpRequest.status>=500 \
timestamp>=\"$TIMESTAMP\""

# Note: The logging read might require specific filters depending on how --canary was set up.
# GCLB usually tags logs with the backend service. Since canary is part of the same backend service, we might need to filter by instance group or simply look at overall 5xx spikes.
ERROR_COUNT=$(gcloud logging read "$QUERY" --project="$PROJECT_ID" --format="json" | jq length)

if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "🚨 Canary Validation Failed! Found $ERROR_COUNT 5xx errors in the last 5 minutes."
    exit 1
fi

echo "✅ Log Verification Passed: 0 5xx errors found."
exit 0
