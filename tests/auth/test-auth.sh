#!/bin/bash
# Phase 3 Authentication Test Script
# Run this after starting both lab and manager servers

set -e

echo "🧪 Phase 3 Authentication Tests"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++)) || true
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++)) || true
}

# Test 1: Check auth providers available
echo "Test 1: Checking auth endpoints..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/auth/get-session)
if [ "$STATUS" = "200" ]; then
    pass "Auth endpoint active"
else
    fail "Failed to reach auth endpoint (Status: $STATUS)"
    exit 1
fi
echo ""

# Test 2: Manager routes should require auth
echo "Test 2: Manager upload without auth (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3002/configs/upload \
    -H "Content-Type: application/json" \
    -d '{"configId":"test","checksum":"abc","config":{}}' 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    pass "Correctly rejected (401 Unauthorized)"
else
    fail "Expected 401, got $HTTP_CODE"
fi
echo ""

# ============================================
# Email/Password Authentication Tests
# ============================================
echo "========================================="
echo "Email/Password Authentication Tests"
echo "========================================="
echo ""

# Test 3: Email/Password Signup
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"
echo "Test 3: Email/Password signup (email: $TEST_EMAIL)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3002/api/auth/sign-up/email \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"Test User\"}" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" = "200" ]; then
    pass "User signup successful"
    echo "   Response: $(echo "$BODY" | head -c 100)..."
else
    fail "Signup failed with code $HTTP_CODE: $BODY"
fi
echo ""

# Test 4: Email/Password Signin
echo "Test 4: Email/Password signin..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3002/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -c /tmp/auth-cookies.txt \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" = "200" ]; then
    pass "User signin successful"
    # Extract session token from cookies
    EMAIL_AUTH_TOKEN=$(grep -E "session_token|better-auth" /tmp/auth-cookies.txt 2>/dev/null | awk '{print $7}' | head -n1)
    if [ -n "$EMAIL_AUTH_TOKEN" ]; then
        echo "   Session token obtained: ${EMAIL_AUTH_TOKEN:0:20}..."
    fi
else
    fail "Signin failed with code $HTTP_CODE: $BODY"
fi
echo ""

# Test 5: Email/Password - Wrong password should fail
echo "Test 5: Email/Password signin with wrong password (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3002/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"WrongPassword!\"}" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "400" ]; then
    pass "Correctly rejected wrong password ($HTTP_CODE)"
else
    fail "Expected 401/400, got $HTTP_CODE"
fi
echo ""

# ============================================
# OAuth Authentication Tests (Manual)
# ============================================
echo "========================================="
echo "OAuth Authentication Tests"
echo "========================================="
echo ""

# OAuth login instructions
echo -e "${YELLOW}📋 Manual OAuth Test Required:${NC}"
echo "1. Open this URL in your browser: http://localhost:3002/test-auth"
echo "2. Click 'Sign in with Google' and complete the flow"
echo "3. Open DevTools → Application → Cookies (for localhost:3002)"
echo "4. Copy 'better-auth.session_token' cookie value"
echo "5. Check if there is a 'better-auth.session_token.sig' cookie. If so, copy it too."
echo "6. Export them:"
echo "   export AUTH_TOKEN='token-value'"
echo "   export AUTH_SIG='sig-value'  # Optional"
echo "   export AUTH_UA='your-user-agent-string' # REQUIRED: Copy from DevTools Console (navigator.userAgent)"
echo "7. Re-run this script"
echo ""

# Check if AUTH_TOKEN is set
if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${YELLOW}⚠${NC}  AUTH_TOKEN not set. Skipping OAuth tests."
    echo "   Set AUTH_TOKEN and re-run for full test coverage."
    echo ""
    echo "================================"
    echo "Results: $PASSED passed, $FAILED failed"
    echo "================================"
    exit 0
fi

# Decode URL-encoded token if needed
if [[ "$AUTH_TOKEN" == *"%"* ]]; then
    echo "Decoding AUTH_TOKEN..."
    AUTH_TOKEN=$(node -e 'console.log(decodeURIComponent(process.argv[1]))' "$AUTH_TOKEN")
fi

# Set User-Agent
UA="${AUTH_UA:-curl/7.64.1}"

# Build cookie header
COOKIE_HEADER="Cookie: better-auth.session_token=$AUTH_TOKEN"
if [ -n "$AUTH_SIG" ]; then
    COOKIE_HEADER="$COOKIE_HEADER; better-auth.session_token.sig=$AUTH_SIG"
fi

# Test 6: Upload config requiring auth
echo "Test 6: Upload config with auth (requireAuth: true)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3002/configs/upload \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3002" \
    -H "User-Agent: $UA" \
    -H "$COOKIE_HEADER" \
    -d '{"configId":"test-auth","checksum":"abc123","requireAuth":true,"config":{"initialPageId":"p1","pages":{"p1":{"id":"p1"}}}}' 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" = "200" ]; then
    pass "Config uploaded successfully"
    OWNER_ID=$(echo "$BODY" | grep -o '"owner":"[^"]*"' | cut -d'"' -f4)
    echo "   Owner: $OWNER_ID"
else
    fail "Upload failed with code $HTTP_CODE"
fi
echo ""

# Test 7: Upload config NOT requiring auth
echo "Test 7: Upload config without auth requirement (requireAuth: false)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3002/configs/upload \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3002" \
    -H "User-Agent: $UA" \
    -H "$COOKIE_HEADER" \
    -d '{"configId":"test-no-auth","checksum":"def456","requireAuth":false,"config":{"initialPageId":"p1","pages":{"p1":{"id":"p1"}}}}' 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    pass "No-auth config uploaded"
else
    fail "Upload failed"
fi
echo ""

# ============================================
# Ownership Checks Tests
# ============================================
echo "========================================="
echo "Ownership Checks Tests"
echo "========================================="
echo ""

# Test 8: List configs - should only show own configs
echo "Test 8: List configs (should only show authenticated user's configs)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:3002/configs \
    -H "Origin: http://localhost:3002" \
    -H "User-Agent: $UA" \
    -H "$COOKIE_HEADER" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" = "200" ]; then
    CONFIG_COUNT=$(echo "$BODY" | grep -o '"configId"' | wc -l)
    pass "Listed configs successfully ($CONFIG_COUNT configs)"
    echo "   Response: $(echo "$BODY" | head -c 150)..."
else
    fail "List failed with code $HTTP_CODE"
fi
echo ""

# Test 9: List configs without auth should fail
echo "Test 9: List configs without auth (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:3002/configs 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    pass "Correctly rejected (401 Unauthorized)"
else
    fail "Expected 401, got $HTTP_CODE"
fi
echo ""

# Test 10: Delete own config should work
echo "Test 10: Delete own config (test-no-auth)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE http://localhost:3002/configs/test-no-auth \
    -H "Origin: http://localhost:3002" \
    -H "User-Agent: $UA" \
    -H "$COOKIE_HEADER" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    pass "Config deleted successfully"
else
    fail "Delete failed with code $HTTP_CODE"
fi
echo ""

# Test 11: Delete without auth should fail
echo "Test 11: Delete config without auth (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE http://localhost:3002/configs/test-auth 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    pass "Correctly rejected (401 Unauthorized)"
else
    fail "Expected 401, got $HTTP_CODE"
fi
echo ""

# Test 12: Media routes require auth
echo "Test 12: Media list without auth (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:3002/media 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    pass "Correctly rejected (401 Unauthorized)"
else
    fail "Expected 401, got $HTTP_CODE"
fi
echo ""

# Test 13: Media list with auth
echo "Test 13: Media list with auth..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:3002/media \
    -H "Origin: http://localhost:3002" \
    -H "User-Agent: $UA" \
    -H "$COOKIE_HEADER" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    pass "Media list successful"
else
    fail "Media list failed with code $HTTP_CODE"
fi
echo ""

# ============================================
# Lab Session Tests
# ============================================
echo "========================================="
echo "Lab Session Tests"
echo "========================================="
echo ""

# Test 14: Lab session with auth required
echo "Test 14: Lab session start without auth (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/sessions/start \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3001" \
    -H "User-Agent: $UA" \
    -d '{"configId":"test-auth"}' 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    pass "Correctly rejected (401 Unauthorized)"
else
    fail "Expected 401, got $HTTP_CODE"
fi
echo ""

# Test 15: Lab session with auth provided
echo "Test 15: Lab session start with auth..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/sessions/start \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3001" \
    -H "User-Agent: $UA" \
    -H "$COOKIE_HEADER" \
    -d '{"configId":"test-auth"}' 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" = "200" ]; then
    pass "Session created with auth"
    SESSION_ID=$(echo "$BODY" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
    echo "   Session ID: $SESSION_ID"
else
    fail "Session creation failed with code $HTTP_CODE"
fi
echo ""

# First re-create the no-auth config for remaining tests
echo "Re-creating test-no-auth config for shareable link tests..."
curl -s -X POST http://localhost:3002/configs/upload \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3002" \
    -H "User-Agent: $UA" \
    -H "$COOKIE_HEADER" \
    -d '{"configId":"test-no-auth","checksum":"def456","requireAuth":false,"config":{"initialPageId":"p1","pages":{"p1":{"id":"p1"}}}}' > /dev/null

# Test 16: Lab session with unique link (no auth required)
echo "Test 16: Lab session with unique link (requireAuth: false)..."
RESPONSE=$(curl -s -X POST http://localhost:3001/sessions/start \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3001" \
    -H "User-Agent: $UA" \
    -d '{"configId":"test-no-auth"}' 2>/dev/null)
if echo "$RESPONSE" | grep -q "shareableLink"; then
    pass "Shareable link generated"
    SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
    TOKEN=$(echo "$RESPONSE" | grep -o '"sessionToken":"[^"]*"' | cut -d'"' -f4)
    LINK=$(echo "$RESPONSE" | grep -o '"shareableLink":"[^"]*"' | cut -d'"' -f4)
    echo "   Session ID: $SESSION_ID"
    echo "   Token: ${TOKEN:0:16}..."
    echo "   Link: $LINK"
    
    # Test 17: Access session with token
    echo ""
    echo "Test 17: Access session with token..."
    ACCESS_RESPONSE=$(curl -s -w "\n%{http_code}" "http://localhost:3001/sessions/$SESSION_ID?token=$TOKEN" 2>/dev/null)
    ACCESS_CODE=$(echo "$ACCESS_RESPONSE" | tail -n1)
    if [ "$ACCESS_CODE" = "200" ]; then
        pass "Session accessible with token"
    else
        fail "Token validation failed"
    fi
    
    # Test 18: Access without token should fail
    echo ""
    echo "Test 18: Access session without token (should fail)..."
    NO_TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" "http://localhost:3001/sessions/$SESSION_ID" 2>/dev/null)
    NO_TOKEN_CODE=$(echo "$NO_TOKEN_RESPONSE" | tail -n1)
    if [ "$NO_TOKEN_CODE" = "401" ]; then
        pass "Correctly rejected without token"
    else
        fail "Expected 401, got $NO_TOKEN_CODE"
    fi
else
    fail "No shareable link in response"
fi

echo ""
echo "================================"
echo "Test Results: $PASSED passed, $FAILED failed"
echo "================================"
echo ""
if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}✓ All Phase 3 Tests Passed!${NC}"
fi
echo ""
echo "Next: Check MongoDB for user and session data:"
echo "  docker compose exec mongodb mongosh pairit --eval \"db.user.find().pretty()\""
echo "  docker compose exec mongodb mongosh pairit --eval \"db.session.find().pretty()\""

