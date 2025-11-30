#!/bin/bash

# Automated test runner for authentication tests
# Builds functions, starts emulators, runs tests, and cleans up automatically

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
EMULATOR_UI_URL="http://127.0.0.1:4000"
AUTH_EMULATOR_URL="http://localhost:9099"
FUNCTIONS_URL="http://127.0.0.1:5001"
MAX_WAIT_TIME=60
WAIT_INTERVAL=2

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
  
  while [ $wait_time -lt $MAX_WAIT_TIME ]; do
    if curl -s "$EMULATOR_UI_URL" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Emulators are ready!${NC}"
      return 0
    fi
    
    echo -n "."
    sleep $WAIT_INTERVAL
    wait_time=$((wait_time + WAIT_INTERVAL))
  done
  
  echo ""
  echo -e "${RED}✗ Timeout waiting for emulators${NC}"
  return 1
}

# Main execution
echo -e "${BLUE}🧪 Automated Authentication Test Suite${NC}"
echo "=========================================="
echo ""

# Step 1: Build functions
echo -e "${BLUE}Step 1:${NC} Building functions..."
cd "$PROJECT_ROOT"
pnpm --filter manager-functions build
pnpm --filter lab-functions build
echo -e "${GREEN}✓ Functions built${NC}"
echo ""

# Step 2: Check if emulators are already running
if curl -s "$EMULATOR_UI_URL" > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠ Emulators appear to be already running${NC}"
  echo "Using existing emulator instance..."
  echo ""
else
  # Step 3: Start emulators in background
  echo -e "${BLUE}Step 2:${NC} Starting Firebase emulators..."
  cd "$PROJECT_ROOT"
  
  # Start emulators in background and capture PID
  firebase emulators:start --only auth,functions,firestore > /tmp/firebase-emulator.log 2>&1 &
  EMULATOR_PID=$!
  
  echo "Emulators starting (PID: $EMULATOR_PID)..."
  echo "Logs: /tmp/firebase-emulator.log"
  
  # Wait for emulators to be ready
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

# Success
echo -e "${GREEN}✅ All authentication tests completed successfully!${NC}"
echo ""

