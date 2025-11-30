#!/bin/bash

# Test script for authentication implementation
# Tests basic authentication without requiring emulators (tests unauthenticated access)
#
# Prerequisites:
#   - Functions emulator should be running (or functions deployed)
#   - To start emulators manually:
#     pnpm --filter manager-functions build
#     pnpm --filter lab-functions build
#     firebase emulators:start --only auth,functions,firestore
#
# Emulator URLs:
#   - Functions: http://127.0.0.1:5001
#   - Firestore: http://localhost:8080
#   - Auth: http://localhost:9099
#   - UI: http://localhost:4000

set -e

BASE_URL="http://127.0.0.1:5001/pairit-lab/us-east4/manager"
FUNCTIONS_URL="http://127.0.0.1:5001/pairit-lab/us-east4"

echo "🧪 Testing Authentication Implementation"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Unauthenticated access to protected endpoint
echo "Test 1: Unauthenticated access to /configs/upload"
echo "Expected: 401 Unauthorized"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/configs/upload" \
  -H "Content-Type: application/json" \
  -d '{"configId":"test","checksum":"abc","config":{}}' || true)
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "401" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Got 401 Unauthorized"
else
  echo -e "${RED}✗ FAIL${NC}: Expected 401, got $http_code"
fi
echo ""

# Test 2: Unauthenticated access to GET /configs
echo "Test 2: Unauthenticated access to /configs"
echo "Expected: 401 Unauthorized"
response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/configs" || true)
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "401" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Got 401 Unauthorized"
else
  echo -e "${RED}✗ FAIL${NC}: Expected 401, got $http_code"
fi
echo ""

# Test 3: Invalid token format
echo "Test 3: Invalid token format"
echo "Expected: 401 Unauthorized"
response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/configs" \
  -H "Authorization: InvalidToken" || true)
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "401" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Got 401 Unauthorized"
else
  echo -e "${RED}✗ FAIL${NC}: Expected 401, got $http_code"
fi
echo ""

# Test 4: Missing Bearer prefix
echo "Test 4: Token without Bearer prefix"
echo "Expected: 401 Unauthorized"
response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/configs" \
  -H "Authorization: some-token" || true)
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "401" ]; then
  echo -e "${GREEN}✓ PASS${NC}: Got 401 Unauthorized"
else
  echo -e "${RED}✗ FAIL${NC}: Expected 401, got $http_code"
fi
echo ""

# Note: Testing with valid tokens requires Firebase Auth emulator setup
echo -e "${YELLOW}Note:${NC} Testing with valid Firebase tokens requires:"
echo "  1. Firebase Auth emulator running"
echo "  2. Creating a test user"
echo "  3. Getting a valid ID token"
echo ""
echo "To test with valid tokens, use the Firebase Auth emulator:"
echo "  firebase emulators:start --only auth,functions,firestore"
echo ""
echo "Then create a test user and get token:"
echo "  curl -X POST 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"test@example.com\",\"password\":\"test123456\"}'"
echo ""

echo "✅ Basic authentication tests completed!"
echo ""
echo "Next steps:"
echo "  1. Start Firebase Auth emulator: firebase emulators:start --only auth,functions,firestore"
echo "  2. Create test user and get token"
echo "  3. Test authenticated endpoints with valid token"

