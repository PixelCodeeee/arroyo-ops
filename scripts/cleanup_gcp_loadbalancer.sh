#!/bin/bash
# Manual Run Script to clean up existing configurations in GCP Load Balancer to reset it perfectly.
# Execute this locally if you want to cleanly build the routing mechanisms over again.

PROJECT_ID="arroyo-seco-project" # Replace with real target
BACKEND_SERVICE="arroyo-backend-service"

echo "Attempting to reset and clean load balancer configurations for $BACKEND_SERVICE..."

# 1. Reset standard configuration (Remove Canary)
gcloud compute backend-services update $BACKEND_SERVICE \
  --project=$PROJECT_ID \
  --global \
  --no-custom-request-headers \
  --custom-response-header="Set-Cookie: X-Frontend-Version=stable; Path=/; Max-Age=3600"

echo "✅ Configurations cleaned up or reset."
