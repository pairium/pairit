#!/bin/bash
set -e

# scripts/test.sh
# Unified test runner for Pairit
# Usage: ./scripts/test.sh [env]
# env options: local, cloud (default: local)

ENV=${1:-local}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🧪 Starting Test Suite for Environment: ${YELLOW}$ENV${NC}"

if [ "$ENV" == "local" ]; then
    # --- Local Setup ---
    if [ -f "$PROJECT_ROOT/.env.local" ]; then
        echo "📜 Loading .env.local..."
        set -a
        source "$PROJECT_ROOT/.env.local"
        set +a
    else
        echo -e "${YELLOW}⚠️  .env.local not found.${NC}"
        echo "Assuming default localhost URLs..."
        export PAIRIT_API_URL="http://localhost:3002"
        export PAIRIT_LAB_URL="http://localhost:3001"
    fi

elif [ "$ENV" == "cloud" ]; then
    # --- Cloud Setup ---
    # Load project ID from standard .env if available
    if [ -f "$PROJECT_ROOT/.env" ]; then
        set -a
        source "$PROJECT_ROOT/.env"
        set +a
    fi
    
    PROJECT_ID=${PROJECT_ID:-"pairit-lab-staging"}
    REGION=${REGION:-"us-central1"}
    
    echo "☁️  Targeting Cloud Project: $PROJECT_ID ($REGION)"
    
    # Discover URLs
    echo "🔍 Discovering Service URLs..."
    
    MANAGER_URL=$(gcloud run services list --filter="SERVICE:pairit-manager" --project "$PROJECT_ID" --region "$REGION" --format="value(URL)" | head -n1)
    LAB_URL=$(gcloud run services list --filter="SERVICE:pairit-lab" --project "$PROJECT_ID" --region "$REGION" --format="value(URL)" | head -n1)
    
    if [ -z "$MANAGER_URL" ] || [ -z "$LAB_URL" ]; then
        echo -e "${RED}❌ Could not discover service URLs. Are services deployed?${NC}"
        exit 1
    fi
    
    echo "   Manager: $MANAGER_URL"
    echo "   Lab:     $LAB_URL"
    
    export PAIRIT_API_URL="$MANAGER_URL"
    export PAIRIT_LAB_URL="$LAB_URL"
    
else
    echo "Unknown environment: $ENV"
    echo "Usage: ./scripts/test.sh [local|cloud]"
    exit 1
fi

# 1. Health Verification
echo ""
echo -e "${BLUE}1. verifying Health...${NC}"
"$PROJECT_ROOT/scripts/tests/verify-health.sh" "$PAIRIT_LAB_URL" "$PAIRIT_API_URL"

# 2. Integration Tests
echo ""
echo -e "${BLUE}2. Running Integration Tests...${NC}"

# Auth Bootstrapping is handled by setup-cli-auth.sh
# We need a test user email
TEST_EMAIL="test-${ENV}-$(date +%s)@example.com"
# Default password for testing
TEST_PW="TestPassword123!"

echo "   Bootstrapping auth for $TEST_EMAIL..."
"$PROJECT_ROOT/scripts/tests/setup-cli-auth.sh" "$PAIRIT_API_URL" "$TEST_EMAIL" "$TEST_PW"

# Run the full CLI test suite
# test-cli-full.sh reads PAIRIT_API_URL from env
"$PROJECT_ROOT/scripts/tests/test-cli-full.sh"

echo ""
echo -e "${GREEN}🎉 All Tests Passed for $ENV!${NC}"
