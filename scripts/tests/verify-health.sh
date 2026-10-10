#!/bin/bash
set -e

# verify-health.sh
# Verifies the health and basic functionality of deployed services (local or cloud)
# Usage: ./verify-health.sh [LAB_URL] [MANAGER_URL]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

LAB_URL=$1
MANAGER_URL=$2

if [ -z "$LAB_URL" ] || [ -z "$MANAGER_URL" ]; then
    echo "Usage: ./verify-health.sh [LAB_URL] [MANAGER_URL]"
    echo "Example: ./verify-health.sh http://localhost:3001 http://localhost:3002"
    exit 1
fi

echo "🔍 Verifying Deployment Health..."

FAILURES=0

# check <label> <url> <accepted status codes...>
check() {
    local label=$1
    local url=$2
    shift 2
    echo -n "🧪 Checking $label ($url)... "
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
    for ok in "$@"; do
        if [ "$status" = "$ok" ]; then
            echo -e "${GREEN}UP ($status)${NC}"
            return
        fi
    done
    echo -e "${RED}FAILED ($status)${NC}"
    FAILURES=$((FAILURES + 1))
}

check "Lab Server" "$LAB_URL" 200 304
check "Manager Server" "$MANAGER_URL" 200 304
check "Auth Endpoint" "$MANAGER_URL/api/auth/get-session" 200

echo "🏁 Health Check Complete"

if [ "$FAILURES" -gt 0 ]; then
    echo -e "${RED}❌ $FAILURES health check(s) failed${NC}"
    exit 1
fi
