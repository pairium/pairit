#!/bin/bash
# Checks that the manager rejects anonymous requests to protected routes.
# Signed-in behavior is covered by test-cli-full.sh, which uses the CLI login.
# Usage: PAIRIT_API_URL=<manager url> ./test-auth.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../common.sh"

API_URL="${PAIRIT_API_URL:-http://localhost:3002}"
PASSED=0
FAILED=0

# expect_status <expected> <description> <curl args...>
expect_status() {
    local expected=$1
    local description=$2
    shift 2
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$@")
    if [ "$status" = "$expected" ]; then
        pass "$description ($status)"
    else
        fail "$description: expected $expected, got $status"
    fi
}

expect_status 200 "Auth session endpoint responds" "$API_URL/api/auth/get-session"
expect_status 401 "Config list requires auth" "$API_URL/configs"
expect_status 401 "Config upload requires auth" -X POST "$API_URL/configs/upload" \
    -H "Content-Type: application/json" \
    -d '{"configId":"test","checksum":"abc","config":{}}'
expect_status 401 "Config delete requires auth" -X DELETE "$API_URL/configs/test"
expect_status 401 "Media list requires auth" "$API_URL/media"

echo "Results: $PASSED passed, $FAILED failed"
if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
