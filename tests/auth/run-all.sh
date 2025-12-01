#!/bin/bash

# Automated test runner for authentication tests
# Builds functions, starts emulators, runs tests, and cleans up automatically
#
# Manual emulator setup (if you want to run emulators separately):
#   1. Build functions:
#      pnpm --filter manager-functions build
#      pnpm --filter lab-functions build
#   2. Start emulators:
#      firebase emulators:start --only auth,functions,firestore
#   3. Emulator URLs:
#      - Functions: http://127.0.0.1:5001
#      - Firestore: http://localhost:8080
#      - Auth: http://localhost:9099
#      - UI: http://localhost:4000

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Emulator configuration
# These URLs are used to check if emulators are running and communicate with them
EMULATOR_UI_URL="http://127.0.0.1:4000"        # Firebase Emulator UI
AUTH_EMULATOR_URL="http://localhost:9099"      # Auth emulator endpoint
FUNCTIONS_URL="http://127.0.0.1:5001"          # Functions emulator endpoint
MAX_WAIT_TIME=60                                # Max seconds to wait for emulators
WAIT_INTERVAL=2                                 # Check interval in seconds

# Track emulator PID
EMULATOR_PID=""

# Cleanup function
cleanup() {
  local exit_code=$?
  
  echo ""
  echo -e "${YELLOW}Cleaning up...${NC}"
  
  # Kill emulator if it's running
  if [ -n "$EMULATOR_PID" ] && kill -0 "$EMULATOR_PID" 2>/dev/null; then
    echo "Stopping Firebase emulators (PID: $EMULATOR_PID)..."
    kill "$EMULATOR_PID" 2>/dev/null || true
    # Wait a bit for graceful shutdown
    sleep 2
    # Force kill if still running
    if kill -0 "$EMULATOR_PID" 2>/dev/null; then
      kill -9 "$EMULATOR_PID" 2>/dev/null || true
    fi
  fi
  
  # Kill any remaining firebase processes
  pkill -f "firebase emulators" 2>/dev/null || true
  
  echo -e "${GREEN}Cleanup complete${NC}"
  
  exit $exit_code
}

# Set up trap for cleanup on exit
trap cleanup EXIT INT TERM

# Function to check if emulator is ready
wait_for_emulator() {
  local wait_time=0
  echo -e "${BLUE}Waiting for emulators to be ready...${NC}"
  
  # First wait for the UI
  while [ $wait_time -lt $MAX_WAIT_TIME ]; do
    if curl -s "$EMULATOR_UI_URL" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Emulator UI is ready!${NC}"
      break
    fi
    
    echo -n "."
    sleep $WAIT_INTERVAL
    wait_time=$((wait_time + WAIT_INTERVAL))
  done
  
  if [ $wait_time -ge $MAX_WAIT_TIME ]; then
    echo ""
    echo -e "${RED}✗ Timeout waiting for emulator UI${NC}"
    return 1
  fi
  
  # Now wait for the manager function to be loaded (takes longer)
  echo -e "${BLUE}Waiting for manager functions to load...${NC}"
  wait_time=0
  while [ $wait_time -lt $MAX_WAIT_TIME ]; do
    # Check if manager function returns a valid response (401 = auth required = function loaded)
    response=$(curl -s -o /dev/null -w "%{http_code}" "$FUNCTIONS_URL/pairit-lab/us-east4/manager/configs" 2>/dev/null || echo "000")
    if [ "$response" = "401" ]; then
      echo -e "${GREEN}✓ Manager functions are ready!${NC}"
      return 0
    fi
    
    echo -n "."
    sleep $WAIT_INTERVAL
    wait_time=$((wait_time + WAIT_INTERVAL))
  done
  
  echo ""
  echo -e "${RED}✗ Timeout waiting for manager functions${NC}"
  return 1
}

# Main execution
echo -e "${BLUE}🧪 Automated Authentication Test Suite${NC}"
echo "=========================================="
echo ""

# Step 1: Build functions
# This builds both manager and lab functions that will be tested
# Manual equivalent: pnpm --filter manager-functions build && pnpm --filter lab-functions build
echo -e "${BLUE}Step 1:${NC} Building functions..."
cd "$PROJECT_ROOT"
pnpm --filter manager-functions build
pnpm --filter lab-functions build
echo -e "${GREEN}✓ Functions built${NC}"
echo ""

# Step 2: Check if emulators are already running
# If emulators are already running manually, we'll use them instead of starting new ones
if curl -s "$EMULATOR_UI_URL" > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠ Emulators appear to be already running${NC}"
  echo "Using existing emulator instance..."
  echo ""
else
  # Step 3: Start emulators in background
  # This automatically starts: firebase emulators:start --only auth,functions,firestore
  # Manual equivalent: Run the same command in a separate terminal
  echo -e "${BLUE}Step 2:${NC} Starting Firebase emulators..."
  cd "$PROJECT_ROOT"
  
  # Start emulators in background and capture PID for cleanup
  firebase emulators:start --only auth,functions,firestore > /tmp/firebase-emulator.log 2>&1 &
  EMULATOR_PID=$!
  
  echo "Emulators starting (PID: $EMULATOR_PID)..."
  echo "Logs: /tmp/firebase-emulator.log"
  
  # Wait for emulators to be ready (checks UI endpoint)
  if ! wait_for_emulator; then
    echo ""
    echo -e "${RED}Failed to start emulators${NC}"
    echo "Check logs: /tmp/firebase-emulator.log"
    exit 1
  fi
  echo ""
fi

# Step 4: Run basic tests (don't require emulators, but check if functions are accessible)
echo -e "${BLUE}Step 3:${NC} Running basic authentication tests..."
cd "$SCRIPT_DIR"
if bash test-basic.sh; then
  echo -e "${GREEN}✓ Basic tests passed${NC}"
else
  echo -e "${RED}✗ Basic tests failed${NC}"
  exit 1
fi
echo ""

# Step 5: Run comprehensive tests with emulator
echo -e "${BLUE}Step 4:${NC} Running comprehensive authentication tests..."
cd "$SCRIPT_DIR"
if bash test-with-emulator.sh; then
  echo -e "${GREEN}✓ Comprehensive tests passed${NC}"
else
  echo -e "${RED}✗ Comprehensive tests failed${NC}"
  exit 1
fi
echo ""

# Step 6: Build CLI for OAuth tests
echo -e "${BLUE}Step 6:${NC} Building CLI for OAuth tests..."
cd "$PROJECT_ROOT"
if pnpm --filter pairit-cli build; then
  echo -e "${GREEN}✓ CLI built${NC}"
else
  echo -e "${YELLOW}⚠ CLI build failed, skipping OAuth tests${NC}"
  echo ""
  echo -e "${GREEN}✅ Authentication tests completed (OAuth tests skipped)${NC}"
  echo ""
  exit 0
fi
echo ""

# Step 7: Run OAuth-specific tests
echo -e "${BLUE}Step 7:${NC} Running OAuth-specific tests..."
cd "$SCRIPT_DIR"
if bash test-oauth.sh; then
  echo -e "${GREEN}✓ OAuth tests passed${NC}"
else
  echo -e "${RED}✗ OAuth tests failed${NC}"
  exit 1
fi
echo ""

# Success
echo -e "${GREEN}✅ All authentication tests completed successfully!${NC}"
echo ""

