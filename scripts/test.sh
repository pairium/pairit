#!/bin/bash
set -e

# scripts/test.sh
# Unified test runner for Pairit
# Usage: ./scripts/test.sh [local|staging|production]
# default: local
#
# staging and production use the public URLs. The integration step reuses your
# CLI login for that environment (`pairit --env <env> login`). It never creates
# users: email/password auth is disabled, only Google OAuth.

ENV=${1:-local}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load shared utilities
source "$SCRIPT_DIR/common.sh"

echo -e "${BLUE}🧪 Starting Test Suite for Environment: ${YELLOW}$ENV${NC}"

# CLI credentials are keyed by API host, so these must match
# apps/manager/cli/src/env.ts or the saved login won't be found.
case "$ENV" in
    local)
        if [ -f "$PROJECT_ROOT/.env.local" ]; then
            echo "📜 Loading .env.local..."
            set -a
            source "$PROJECT_ROOT/.env.local"
            set +a
        else
            echo -e "${YELLOW}⚠️  .env.local not found.${NC}"
            echo "Assuming default localhost URLs..."
        fi
        export PAIRIT_API_URL="${PAIRIT_API_URL:-http://localhost:3002}"
        export PAIRIT_LAB_URL="${PAIRIT_LAB_URL:-http://localhost:3001}"
        CLI_CMD="PAIRIT_API_URL=$PAIRIT_API_URL bun run apps/manager/cli/src/index.ts"
        ;;
    staging)
        export PAIRIT_ENV=staging
        export PAIRIT_API_URL="https://pairit-api-staging.pairium.ai"
        export PAIRIT_LAB_URL="https://pairit-staging.pairium.ai"
        CLI_CMD="bun run apps/manager/cli/src/index.ts --env staging"
        ;;
    production)
        export PAIRIT_ENV=production
        export PAIRIT_API_URL="https://pairit-api.pairium.ai"
        export PAIRIT_LAB_URL="https://pairit.pairium.ai"
        CLI_CMD="bun run apps/manager/cli/src/index.ts --env production"
        ;;
    *)
        echo "Unknown environment: $ENV"
        echo "Usage: ./scripts/test.sh [local|staging|production]"
        exit 1
        ;;
esac

echo "   Manager: $PAIRIT_API_URL"
echo "   Lab:     $PAIRIT_LAB_URL"

# 1. Health Verification
echo ""
echo -e "${BLUE}1. Verifying Health...${NC}"
"$PROJECT_ROOT/scripts/tests/verify-health.sh" "$PAIRIT_LAB_URL" "$PAIRIT_API_URL"

# 2. Auth Enforcement
echo ""
echo -e "${BLUE}2. Verifying protected routes reject anonymous requests...${NC}"
"$PROJECT_ROOT/scripts/tests/auth/test-auth.sh"

# 3. Integration Tests
echo ""
echo -e "${BLUE}3. Running Integration Tests...${NC}"

echo "   Checking CLI login for $PAIRIT_API_URL..."
set +e
LOGIN_CHECK=$(cd "$PROJECT_ROOT" && bun run apps/manager/cli/src/index.ts config list 2>&1)
LOGIN_STATUS=$?
set -e

if echo "$LOGIN_CHECK" | grep -q "HTTP 401"; then
    log_error "❌ Not logged in to $ENV. Log in once, then re-run:"
    echo ""
    echo "   $CLI_CMD login"
    echo ""
    exit 1
elif echo "$LOGIN_CHECK" | grep -q "HTTP 403"; then
    log_error "❌ Logged in to $ENV, but this account is not on the manager allowlist."
    echo "   Ask an admin to run: $CLI_CMD admin add-user <your-email>"
    exit 1
elif [ $LOGIN_STATUS -ne 0 ]; then
    log_error "❌ Could not reach the manager with the CLI:"
    echo "$LOGIN_CHECK"
    exit $LOGIN_STATUS
fi
log_success "   ✓ Logged in"

"$PROJECT_ROOT/scripts/tests/test-cli-full.sh"

echo ""
echo -e "${GREEN}🎉 All Tests Passed for $ENV!${NC}"
