#!/bin/bash
set -e

# verify-health.sh
# Verifies the health and basic functionality of deployed services (local or cloud)
# Usage: ./verify-health.sh [LAB_URL] [MANAGER_URL]

LAB_URL=$1
MANAGER_URL=$2

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$LAB_URL" ] || [ -z "$MANAGER_URL" ]; then
    echo "Usage: ./verify-health.sh [LAB_URL] [MANAGER_URL]"
    echo "Example: ./verify-health.sh http://localhost:3001 http://localhost:3002"
    exit 1
fi

echo "🔍 Verifying Deployment Health..."

# 1. Check Lab Server
echo -n "🧪 Checking Lab Server ($LAB_URL)... "
LAB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$LAB_URL")
if [ "$LAB_STATUS" -eq 200 ] || [ "$LAB_STATUS" -eq 304 ]; then
    echo -e "${GREEN}UP ($LAB_STATUS)${NC}"
else
    echo -e "${RED}FAILED ($LAB_STATUS)${NC}"
    # Don't exit yet, check Manager too
fi

# 2. Check Manager Server
echo -n "🧪 Checking Manager Server ($MANAGER_URL)... "
MANAGER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANAGER_URL")
if [ "$MANAGER_STATUS" -eq 200 ] || [ "$MANAGER_STATUS" -eq 304 ]; then
    echo -e "${GREEN}UP ($MANAGER_STATUS)${NC}"
else
    echo -e "${RED}FAILED ($MANAGER_STATUS)${NC}"
fi

# 3. Check Auth Endpoint (Basic reachability)
# api/auth/providers is a standard better-auth endpoint
echo -n "🧪 Checking Auth Endpoint... "
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANAGER_URL/api/auth/providers")
if [ "$AUTH_STATUS" -lt 500 ]; then
    echo -e "${GREEN}REACHABLE ($AUTH_STATUS)${NC}"
else
    echo -e "${RED}ERROR ($AUTH_STATUS)${NC}"
fi

echo "🏁 Health Check Complete"
