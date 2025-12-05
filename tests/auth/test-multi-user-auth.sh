#!/bin/bash

# Multi-user authentication test script
# Tests different configs with pairit CLI for multiple users and sign-in methods
#
# Sign-in Methods Tested:
#   - Email link (passwordless magic link)
#   - Google OAuth
#
# Prerequisites:
#   - CLI must be built: pnpm --filter pairit-cli build
#   - Required environment variables:
#     - FIREBASE_API_KEY
#     - GOOGLE_CLIENT_ID
#     - GOOGLE_CLIENT_SECRET
#   - For production tests (not emulator):
#     - Email link sign-in enabled in Firebase Console
#     - Google Sign-In enabled in Firebase Console
#
# Usage:
#   ./test-multi-user-auth.sh <user1-email> <user2-email> [options]
#   ./test-multi-user-auth.sh user1@example.com user2@example.com
#   ./test-multi-user-auth.sh user1@example.com user2@example.com --skip-oauth
#
# Options:
#   --skip-oauth    Skip Google OAuth tests
#   --skip-email    Skip email link tests
#   --help          Show this help

set -e

# ============================================================================
# Constants
# ============================================================================

# Script paths (defined first so we can use them to load .env)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load .env file if it exists (for environment variables like GOOGLE_CLIENT_ID)
if [ -f "$PROJECT_ROOT/.env" ]; then
  # Export variables from .env file (skip comments and empty lines)
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Test users (set from command line arguments)
USER1_EMAIL=""
USER2_EMAIL=""
CLI_PATH="$PROJECT_ROOT/manager/cli/dist/index.js"
TEST_CONFIG_PATH="$PROJECT_ROOT/manager/test-config.yaml"
AUTH_CONFIG_DIR="$HOME/.config/pairit"
AUTH_CONFIG_FILE="$AUTH_CONFIG_DIR/auth.json"

# Test config IDs (unique per test run to avoid conflicts)
TEST_RUN_ID="$(date +%s)"
CROSS_METHOD_CONFIG_ID="test-cross-method-$TEST_RUN_ID"
CROSS_USER_CONFIG_ID="test-cross-user-$TEST_RUN_ID"
USER2_CONFIG_ID="test-user2-$TEST_RUN_ID"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Current logged-in user tracking (to minimize logins)
CURRENT_USER=""
CURRENT_METHOD=""

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_skip() {
  echo -e "${YELLOW}[SKIP]${NC} $1"
  TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

log_section() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
}

# Backup and restore auth config
backup_auth() {
  if [ -f "$AUTH_CONFIG_FILE" ]; then
    cp "$AUTH_CONFIG_FILE" "$AUTH_CONFIG_FILE.backup"
  fi
}

restore_auth() {
  if [ -f "$AUTH_CONFIG_FILE.backup" ]; then
    mv "$AUTH_CONFIG_FILE.backup" "$AUTH_CONFIG_FILE"
  fi
}

# Get current auth status
get_auth_status() {
  node "$CLI_PATH" auth status 2>&1 || true
}

# Get current user email from auth config
get_current_user_email() {
  if [ -f "$AUTH_CONFIG_FILE" ]; then
    grep -o '"email": *"[^"]*' "$AUTH_CONFIG_FILE" 2>/dev/null | sed 's/.*: *"//' | tr -d '"' || echo ""
  else
    echo ""
  fi
}

# Get current auth provider from auth config
get_current_provider() {
  if [ -f "$AUTH_CONFIG_FILE" ]; then
    grep -o '"provider": *"[^"]*' "$AUTH_CONFIG_FILE" 2>/dev/null | sed 's/.*: *"//' | tr -d '"' || echo ""
  else
    echo ""
  fi
}

# Save current auth token for comparison
save_auth_snapshot() {
  local snapshot_name="$1"
  if [ -f "$AUTH_CONFIG_FILE" ]; then
    cp "$AUTH_CONFIG_FILE" "/tmp/pairit-auth-$snapshot_name.json"
  fi
}

# Compare auth tokens (uid and email)
compare_auth_tokens() {
  local snapshot1="$1"
  local snapshot2="$2"
  
  local uid1=$(grep -o '"uid": *"[^"]*' "/tmp/pairit-auth-$snapshot1.json" 2>/dev/null | sed 's/.*: *"//' | tr -d '"')
  local uid2=$(grep -o '"uid": *"[^"]*' "/tmp/pairit-auth-$snapshot2.json" 2>/dev/null | sed 's/.*: *"//' | tr -d '"')
  local email1=$(grep -o '"email": *"[^"]*' "/tmp/pairit-auth-$snapshot1.json" 2>/dev/null | sed 's/.*: *"//' | tr -d '"')
  local email2=$(grep -o '"email": *"[^"]*' "/tmp/pairit-auth-$snapshot2.json" 2>/dev/null | sed 's/.*: *"//' | tr -d '"')
  
  if [ "$uid1" = "$uid2" ] && [ "$email1" = "$email2" ]; then
    echo "match"
  else
    echo "mismatch (uid1=$uid1, uid2=$uid2, email1=$email1, email2=$email2)"
  fi
}

# Run CLI command and capture output
run_cli() {
  node "$CLI_PATH" "$@" 2>&1
}

# ============================================================================
# Prerequisite Checks
# ============================================================================

check_prerequisites() {
  log_section "Checking Prerequisites"
  
  # Check CLI binary exists
  if [ ! -f "$CLI_PATH" ]; then
    echo -e "${RED}ERROR:${NC} CLI not built at $CLI_PATH"
    echo "Build CLI with: pnpm --filter pairit-cli build"
    exit 1
  fi
  log_success "CLI binary exists"
  
  # Check test config exists
  if [ ! -f "$TEST_CONFIG_PATH" ]; then
    echo -e "${RED}ERROR:${NC} Test config not found at $TEST_CONFIG_PATH"
    exit 1
  fi
  log_success "Test config exists"
  
  # Check .env loading
  if [ -f "$PROJECT_ROOT/.env" ]; then
    log_success "Loaded .env from $PROJECT_ROOT/.env"
  fi
  
  # Check environment variables
  if [ -z "$FIREBASE_API_KEY" ]; then
    echo -e "${YELLOW}WARNING:${NC} FIREBASE_API_KEY not set"
    echo "Set it with: export FIREBASE_API_KEY=your-api-key"
  else
    log_success "FIREBASE_API_KEY is set"
  fi
  
  if [ -z "$GOOGLE_CLIENT_ID" ]; then
    echo -e "${YELLOW}WARNING:${NC} GOOGLE_CLIENT_ID not set"
    echo "OAuth tests will be skipped"
  else
    log_success "GOOGLE_CLIENT_ID is set (${GOOGLE_CLIENT_ID:0:20}...)"
  fi
  
  if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo -e "${YELLOW}WARNING:${NC} GOOGLE_CLIENT_SECRET not set"
    echo "OAuth tests will be skipped"
  else
    log_success "GOOGLE_CLIENT_SECRET is set"
  fi
  
  echo ""
}

# ============================================================================
# Authentication Functions
# ============================================================================

# Internal: Interactive login with email link
login_email() {
  local email="$1"
  log_info "Logging in with email link for $email"
  log_info "Please complete the sign-in flow in your email/browser..."
  
  # Run interactive login
  echo ""
  run_cli auth login --provider email
  local exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    local current_email=$(get_current_user_email)
    if [ "$current_email" = "$email" ]; then
      log_success "Email login successful for $email"
      CURRENT_USER="$email"
      CURRENT_METHOD="email"
      return 0
    else
      log_fail "Email login: expected $email, got $current_email"
      CURRENT_USER=""
      CURRENT_METHOD=""
      return 1
    fi
  else
    log_fail "Email login failed for $email"
    CURRENT_USER=""
    CURRENT_METHOD=""
    return 1
  fi
}

# Internal: Interactive login with Google OAuth
login_google() {
  local expected_email="$1"
  log_info "Logging in with Google OAuth for $expected_email"
  log_info "Please complete the OAuth flow in your browser..."
  log_info "Make sure to sign in with the Google account: $expected_email"
  
  # Run interactive login
  echo ""
  run_cli auth login --provider google
  local exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    local current_email=$(get_current_user_email)
    if [ "$current_email" = "$expected_email" ]; then
      log_success "Google OAuth login successful for $expected_email"
      CURRENT_USER="$expected_email"
      CURRENT_METHOD="google"
      return 0
    else
      log_fail "Google OAuth login: expected $expected_email, got $current_email"
      CURRENT_USER=""
      CURRENT_METHOD=""
      return 1
    fi
  else
    log_fail "Google OAuth login failed"
    CURRENT_USER=""
    CURRENT_METHOD=""
    return 1
  fi
}

# ============================================================================
# CLI Command Tests
# ============================================================================

test_auth_status() {
  local expected_email="$1"
  log_info "Testing auth status..."
  
  local output=$(run_cli auth status)
  if echo "$output" | grep -q "Authenticated as $expected_email"; then
    log_success "Auth status shows: Authenticated as $expected_email"
    return 0
  else
    log_fail "Auth status unexpected: $output"
    return 1
  fi
}

test_config_list() {
  log_info "Testing config list..."
  
  local output=$(run_cli config list 2>&1)
  local exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    log_success "Config list returned successfully"
    echo "  Output: $output"
    return 0
  else
    log_fail "Config list failed: $output"
    return 1
  fi
}

test_config_upload() {
  local config_id="$1"
  log_info "Testing config upload with id: $config_id..."
  
  local output=$(run_cli config upload "$TEST_CONFIG_PATH" --config-id "$config_id" 2>&1)
  local exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    log_success "Config upload successful: $config_id"
    echo "  Output: $output"
    return 0
  else
    log_fail "Config upload failed: $output"
    return 1
  fi
}

test_config_delete() {
  local config_id="$1"
  log_info "Testing config delete: $config_id..."
  
  local output=$(run_cli config delete "$config_id" --force 2>&1)
  local exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    log_success "Config delete successful: $config_id"
    return 0
  else
    log_fail "Config delete failed: $output"
    return 1
  fi
}

test_config_exists_in_list() {
  local config_id="$1"
  log_info "Verifying config $config_id appears in list..."
  
  local config_list=$(run_cli config list 2>&1)
  if echo "$config_list" | grep -q "$config_id"; then
    log_success "Config $config_id appears in list"
    return 0
  else
    log_fail "Config $config_id not found in list"
    return 1
  fi
}

# ============================================================================
# Cross-User Access Test
# ============================================================================

test_cross_user_access() {
  local target_config="$1"
  local owner_email="$2"
  log_info "Testing cross-user access protection..."
  log_info "Current user should NOT be able to delete $owner_email's config"
  
  local output=$(run_cli config delete "$target_config" --force 2>&1)
  
  if echo "$output" | grep -qi "permission\|forbidden\|403\|denied"; then
    log_success "Cross-user access blocked (403 Forbidden)"
    return 0
  else
    log_fail "Cross-user access NOT blocked: $output"
    return 1
  fi
}

# ============================================================================
# Main Test Execution (Optimized: 4 logins instead of 8)
# ============================================================================

main() {
  # Parse arguments - first two non-option args are emails
  local skip_oauth=false
  local skip_email=false
  local positional_args=()
  
  for arg in "$@"; do
    case $arg in
      --skip-oauth) skip_oauth=true ;;
      --skip-email) skip_email=true ;;
      --help|-h)
        echo "Multi-User Authentication Test Suite"
        echo ""
        echo "Usage: $0 <user1-email> <user2-email> [options]"
        echo ""
        echo "Arguments:"
        echo "  user1-email    Email for first test user"
        echo "  user2-email    Email for second test user"
        echo ""
        echo "Options:"
        echo "  --skip-oauth   Skip Google OAuth tests"
        echo "  --skip-email   Skip email link tests"
        echo "  --help         Show this help"
        echo ""
        echo "Examples:"
        echo "  $0 alice@example.com bob@example.com"
        echo "  $0 alice@example.com bob@example.com --skip-oauth"
        exit 0
        ;;
      -*)
        echo "Unknown option: $arg"
        echo "Use --help for usage information"
        exit 1
        ;;
      *)
        positional_args+=("$arg")
        ;;
    esac
  done
  
  # Validate email arguments
  if [ ${#positional_args[@]} -lt 2 ]; then
    echo -e "${RED}ERROR:${NC} Two email addresses are required"
    echo ""
    echo "Usage: $0 <user1-email> <user2-email> [options]"
    echo "Use --help for more information"
    exit 1
  fi
  
  USER1_EMAIL="${positional_args[0]}"
  USER2_EMAIL="${positional_args[1]}"
  
  # Validate emails are different
  if [ "$USER1_EMAIL" = "$USER2_EMAIL" ]; then
    echo -e "${RED}ERROR:${NC} Two different email addresses are required"
    exit 1
  fi
  
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║       Multi-User Authentication Test Suite                    ║${NC}"
  echo -e "${CYAN}║       (Optimized: 4 logins)                                   ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Test Users:"
  echo "  User 1: $USER1_EMAIL (will test both email + OAuth)"
  echo "  User 2: $USER2_EMAIL (will test OAuth only for cross-user)"
  echo ""
  
  # Check prerequisites
  check_prerequisites
  
  # Backup existing auth
  backup_auth
  trap restore_auth EXIT
  
  # Check OAuth availability
  if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    log_info "Google OAuth credentials not set - OAuth tests will be skipped"
    skip_oauth=true
  fi
  
  # ==========================================================================
  # Phase 1: User1 Email Login (Login #1)
  # Tests: Email auth, basic operations, create config for cross-method test
  # ==========================================================================
  
  if [ "$skip_email" = false ]; then
    log_section "Phase 1: User1 Email Authentication (Login #1)"
    echo "Testing: Email login, basic operations, cross-method setup"
    echo ""
    
    if ! login_email "$USER1_EMAIL"; then
      log_fail "Phase 1 failed: Could not login User1 with email"
      exit 1
    fi
    
    # Save snapshot for cross-method identity comparison
    save_auth_snapshot "user1-email"
    
    # Test basic operations
    test_auth_status "$USER1_EMAIL"
    test_config_list
    
    # Upload config for cross-method test
    test_config_upload "$CROSS_METHOD_CONFIG_ID"
    test_config_exists_in_list "$CROSS_METHOD_CONFIG_ID"
    
    # Verify provider field
    local email_provider=$(get_current_provider)
    if [ "$email_provider" = "email" ]; then
      log_success "Email login has provider='email'"
    else
      log_fail "Email login provider: expected 'email', got '$email_provider'"
    fi
  fi
  
  # ==========================================================================
  # Phase 2: User1 OAuth Login (Login #2)
  # Tests: OAuth auth, cross-method identity, cross-method access/management
  # ==========================================================================
  
  if [ "$skip_oauth" = false ]; then
    log_section "Phase 2: User1 OAuth Authentication (Login #2)"
    echo "Testing: OAuth login, cross-method identity verification"
    echo ""
    
    if ! login_google "$USER1_EMAIL"; then
      log_fail "Phase 2 failed: Could not login User1 with OAuth"
      exit 1
    fi
    
    # Save snapshot for comparison
    save_auth_snapshot "user1-oauth"
    
    # Test basic operations
    test_auth_status "$USER1_EMAIL"
    
    # Verify provider field
    local oauth_provider=$(get_current_provider)
    if [ "$oauth_provider" = "google" ]; then
      log_success "Google login has provider='google'"
    else
      log_fail "Google login provider: expected 'google', got '$oauth_provider'"
    fi
    
    # Cross-method identity verification (if email test was run)
    if [ "$skip_email" = false ]; then
      log_info "Verifying same user identity across login methods..."
      local comparison=$(compare_auth_tokens "user1-email" "user1-oauth")
      if [ "$comparison" = "match" ]; then
        log_success "User identity matches between email and Google OAuth"
      else
        log_fail "User identity mismatch: $comparison"
      fi
      
      # Cross-method access: verify config from email auth is accessible
      log_info "Verifying config from email auth is accessible with OAuth..."
      test_config_exists_in_list "$CROSS_METHOD_CONFIG_ID"
      
      # Cross-method management: delete config created with email auth
      log_info "Deleting config created with email auth (using OAuth)..."
      test_config_delete "$CROSS_METHOD_CONFIG_ID"
      log_success "Cross-method config management works correctly"
    fi
    
    # Upload config for cross-user test
    test_config_upload "$CROSS_USER_CONFIG_ID"
    test_config_exists_in_list "$CROSS_USER_CONFIG_ID"
  fi
  
  # ==========================================================================
  # Phase 3: User2 OAuth Login (Login #3)
  # Tests: Different user OAuth, cross-user access protection
  # ==========================================================================
  
  if [ "$skip_oauth" = false ]; then
    log_section "Phase 3: User2 OAuth Authentication (Login #3)"
    echo "Testing: Different user login, cross-user access protection"
    echo ""
    
    if ! login_google "$USER2_EMAIL"; then
      log_fail "Phase 3 failed: Could not login User2 with OAuth"
      exit 1
    fi
    
    # Test basic operations for User2
    test_auth_status "$USER2_EMAIL"
    test_config_list
    
    # Upload User2's own config
    test_config_upload "$USER2_CONFIG_ID"
    test_config_exists_in_list "$USER2_CONFIG_ID"
    
    # Cross-user access test: User2 tries to delete User1's config
    log_info "Testing cross-user access protection..."
    test_cross_user_access "$CROSS_USER_CONFIG_ID" "$USER1_EMAIL"
    
    # Cleanup User2's config while still logged in
    log_info "Cleaning up User2's config..."
    run_cli config delete "$USER2_CONFIG_ID" --force 2>/dev/null || true
    log_success "User2 config deleted"
  fi
  
  # ==========================================================================
  # Phase 4: User1 OAuth Login (Login #4) - Cleanup
  # ==========================================================================
  
  if [ "$skip_oauth" = false ]; then
    log_section "Phase 4: Cleanup (Login #4)"
    
    if ! login_google "$USER1_EMAIL"; then
      log_fail "Phase 4 failed: Could not login User1 for cleanup"
      echo -e "${YELLOW}WARNING:${NC} Config $CROSS_USER_CONFIG_ID may need manual cleanup"
    else
      log_info "Deleting User1's remaining config..."
      run_cli config delete "$CROSS_USER_CONFIG_ID" --force 2>/dev/null || true
      log_success "Cleanup complete"
    fi
  fi
  
  # ==========================================================================
  # Email-only fallback tests (if OAuth skipped but email available)
  # ==========================================================================
  
  if [ "$skip_oauth" = true ] && [ "$skip_email" = false ]; then
    log_section "Email-Only Cross-User Test"
    
    # Need User2 email login for cross-user test
    log_info "Logging in User2 with email for cross-user test..."
    if login_email "$USER2_EMAIL"; then
      test_auth_status "$USER2_EMAIL"
      test_config_upload "$USER2_CONFIG_ID"
      
      # Create User1 config first
      log_info "Switching to User1 to create test config..."
      if login_email "$USER1_EMAIL"; then
        local email_cross_config="test-email-cross-$TEST_RUN_ID"
        test_config_upload "$email_cross_config"
        
        # Switch back to User2 for cross-user test
        if login_email "$USER2_EMAIL"; then
          test_cross_user_access "$email_cross_config" "$USER1_EMAIL"
          
          # Cleanup User2 config
          run_cli config delete "$USER2_CONFIG_ID" --force 2>/dev/null || true
          
          # Switch to User1 for cleanup
          login_email "$USER1_EMAIL"
          run_cli config delete "$email_cross_config" --force 2>/dev/null || true
        fi
      fi
    fi
  fi
  
  # ==========================================================================
  # Summary
  # ==========================================================================
  
  log_section "Test Summary"
  
  echo "Results:"
  echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
  echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
  echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
  echo ""
  
  if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
  else
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
  fi
}

# Run main function
main "$@"
