#!/bin/bash
set -e

# verify-cloud.sh
# Verifies the health and basic functionality of deployed Cloud Run services

LAB_URL=$1
MANAGER_URL=$2

if [ -z "$LAB_URL" ] || [ -z "$MANAGER_URL" ]; then
    echo "Usage: ./verify-cloud.sh [LAB_URL] [MANAGER_URL]"
    echo "Example: ./verify-cloud.sh https://pairit-lab-xyz.a.run.app https://pairit-manager-xyz.a.run.app"
    exit 1
fi

echo "🔍 Verifying Cloud Deployment..."

# 1. Check Lab Server
echo "🧪 Checking Lab Server ($LAB_URL)..."
LAB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$LAB_URL")
if [ "$LAB_STATUS" -eq 200 ] || [ "$LAB_STATUS" -eq 304 ]; then
    echo "✅ Lab Server is UP ($LAB_STATUS)"
else
    echo "❌ Lab Server failed health check ($LAB_STATUS)"
    # Don't exit yet, check Manager too
fi

# 2. Check Manager Server
echo "🧪 Checking Manager Server ($MANAGER_URL)..."
MANAGER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANAGER_URL")
if [ "$MANAGER_STATUS" -eq 200 ] || [ "$MANAGER_STATUS" -eq 304 ]; then
    echo "✅ Manager Server is UP ($MANAGER_STATUS)"
else
    echo "❌ Manager Server failed health check ($MANAGER_STATUS)"
fi

# 3. Check CLI Compatibility
# We can't easily run full integration tests without a valid token, 
# but we can try to hit the auth endpoint to ensure it's reachable.
echo "🧪 Checking Auth Endpoint..."
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANAGER_URL/api/auth/providers")
# Better Auth might return 200 or 404 depending on config, but if it's 5xx that's bad.
if [ "$AUTH_STATUS" -lt 500 ]; then
    echo "✅ Auth Endpoint is reachable ($AUTH_STATUS)"
else
    echo "❌ Auth Endpoint returned server error ($AUTH_STATUS)"
fi

echo "🏁 Verification Complete"
