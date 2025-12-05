#!/bin/bash

# Auth Method Comparison Test Script
# Tests that different sign-in methods produce equivalent auth behavior
#
# This script compares auth tokens and CLI behavior between:
#   - Email link authentication
#   - Google OAuth authentication
#
# Usage:
#   # First, save auth snapshots for comparison:
#   ./test-auth-comparison.sh --save-snapshot email-user1
#   ./test-auth-comparison.sh --save-snapshot google-user1
#   
#   # Then compare the snapshots:
#   ./test-auth-comparison.sh --compare email-user1 google-user1
#
#   # Or run quick auth status check:
#   ./test-auth-comparison.sh --check-status
#
# The snapshots include:
#   - Auth token (sanitized - no actual tokens stored)
#   - Config list results
#   - User identity information

set -e

# ============================================================================
# Constants
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI_PATH="$PROJECT_ROOT/manager/cli/dist/index.js"
AUTH_CONFIG_FILE="$HOME/.config/pairit/auth.json"
SNAPSHOT_DIR="$SCRIPT_DIR/snapshots"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================================================
# Helper Functions
# ============================================================================

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

run_cli() {
  node "$CLI_PATH" "$@" 2>&1
}

ensure_snapshot_dir() {
  mkdir -p "$SNAPSHOT_DIR"
}

# ============================================================================
# Snapshot Functions
# ============================================================================

save_snapshot() {
  local name="$1"
  
  ensure_snapshot_dir
  
  if [ ! -f "$AUTH_CONFIG_FILE" ]; then
    echo -e "${RED}ERROR:${NC} Not authenticated. Run 'pairit auth login' first."
    exit 1
  fi
  
  local snapshot_file="$SNAPSHOT_DIR/$name.json"
  
  log_info "Saving auth snapshot: $name"
  
  # Extract non-sensitive auth info
  local uid=$(grep -o '"uid": *"[^"]*' "$AUTH_CONFIG_FILE" | sed 's/.*: *"//' | tr -d '"')
  local email=$(grep -o '"email": *"[^"]*' "$AUTH_CONFIG_FILE" | sed 's/.*: *"//' | tr -d '"')
  local provider=$(grep -o '"provider": *"[^"]*' "$AUTH_CONFIG_FILE" | sed 's/.*: *"//' | tr -d '"')
  local expires_at=$(grep -o '"expiresAt": *"[^"]*' "$AUTH_CONFIG_FILE" | sed 's/.*: *"//' | tr -d '"')
  
  # Get config list
  local config_list=$(run_cli config list 2>&1 || echo "ERROR")
  local config_count=$(echo "$config_list" | grep -c '|' || echo "0")
  
  # Get auth status
  local auth_status=$(run_cli auth status 2>&1 || echo "ERROR")
  
  # Create snapshot JSON
  cat > "$snapshot_file" << EOF
{
  "snapshot_name": "$name",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "auth": {
    "uid": "$uid",
    "email": "$email",
    "provider": "$provider",
    "expires_at": "$expires_at"
  },
  "cli_results": {
    "auth_status": $(echo "$auth_status" | head -1 | jq -R . 2>/dev/null || echo "\"$auth_status\""),
    "config_count": $config_count
  }
}
EOF

  log_success "Snapshot saved: $snapshot_file"
  echo ""
  echo "Snapshot contents:"
  cat "$snapshot_file" | jq . 2>/dev/null || cat "$snapshot_file"
  echo ""
}

# ============================================================================
# Comparison Functions
# ============================================================================

compare_snapshots() {
  local snapshot1="$1"
  local snapshot2="$2"
  
  local file1="$SNAPSHOT_DIR/$snapshot1.json"
  local file2="$SNAPSHOT_DIR/$snapshot2.json"
  
  if [ ! -f "$file1" ]; then
    echo -e "${RED}ERROR:${NC} Snapshot not found: $file1"
    exit 1
  fi
  
  if [ ! -f "$file2" ]; then
    echo -e "${RED}ERROR:${NC} Snapshot not found: $file2"
    exit 1
  fi
  
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}Comparing Auth Snapshots${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Snapshot 1: $snapshot1"
  echo "Snapshot 2: $snapshot2"
  echo ""
  
  # Extract values
  local uid1=$(jq -r '.auth.uid' "$file1")
  local uid2=$(jq -r '.auth.uid' "$file2")
  local email1=$(jq -r '.auth.email' "$file1")
  local email2=$(jq -r '.auth.email' "$file2")
  local provider1=$(jq -r '.auth.provider' "$file1")
  local provider2=$(jq -r '.auth.provider' "$file2")
  
  local tests_passed=0
  local tests_failed=0
  
  # Test 1: Same UID
  echo -e "${BLUE}Test 1:${NC} User ID (UID) Comparison"
  echo "  Snapshot 1 UID: $uid1"
  echo "  Snapshot 2 UID: $uid2"
  if [ "$uid1" = "$uid2" ]; then
    log_success "UIDs match - same user identity"
    tests_passed=$((tests_passed + 1))
  else
    log_fail "UIDs do NOT match - different user identities!"
    tests_failed=$((tests_failed + 1))
  fi
  echo ""
  
  # Test 2: Same Email
  echo -e "${BLUE}Test 2:${NC} Email Comparison"
  echo "  Snapshot 1 Email: $email1"
  echo "  Snapshot 2 Email: $email2"
  if [ "$email1" = "$email2" ]; then
    log_success "Emails match"
    tests_passed=$((tests_passed + 1))
  else
    log_fail "Emails do NOT match!"
    tests_failed=$((tests_failed + 1))
  fi
  echo ""
  
  # Test 3: Different Providers
  echo -e "${BLUE}Test 3:${NC} Provider Field Comparison"
  echo "  Snapshot 1 Provider: $provider1"
  echo "  Snapshot 2 Provider: $provider2"
  if [ "$provider1" != "$provider2" ]; then
    log_success "Providers correctly differ (email vs google)"
    tests_passed=$((tests_passed + 1))
  else
    log_warn "Providers are the same - expected different methods"
  fi
  echo ""
  
  # Test 4: Config Access
  echo -e "${BLUE}Test 4:${NC} Config Access Comparison"
  local count1=$(jq -r '.cli_results.config_count' "$file1")
  local count2=$(jq -r '.cli_results.config_count' "$file2")
  echo "  Snapshot 1 Config Count: $count1"
  echo "  Snapshot 2 Config Count: $count2"
  if [ "$count1" = "$count2" ]; then
    log_success "Config counts match - same access level"
    tests_passed=$((tests_passed + 1))
  else
    log_warn "Config counts differ (may be expected if configs changed)"
  fi
  echo ""
  
  # Summary
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo "Summary:"
  echo -e "  ${GREEN}Passed:${NC} $tests_passed"
  echo -e "  ${RED}Failed:${NC} $tests_failed"
  echo ""
  
  if [ $tests_failed -gt 0 ]; then
    echo -e "${RED}✗ Auth methods produce DIFFERENT user identities${NC}"
    echo "This may indicate account linking issues in Firebase."
    exit 1
  else
    echo -e "${GREEN}✓ Auth methods produce EQUIVALENT behavior${NC}"
    echo "Both sign-in methods authenticate the same user correctly."
    exit 0
  fi
}

# ============================================================================
# Quick Status Check
# ============================================================================

check_status() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}Current Auth Status${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  
  if [ ! -f "$AUTH_CONFIG_FILE" ]; then
    echo -e "${YELLOW}Not authenticated${NC}"
    echo "Run: pairit auth login --provider [email|google]"
    exit 0
  fi
  
  local uid=$(grep -o '"uid": *"[^"]*' "$AUTH_CONFIG_FILE" | sed 's/.*: *"//' | tr -d '"')
  local email=$(grep -o '"email": *"[^"]*' "$AUTH_CONFIG_FILE" | sed 's/.*: *"//' | tr -d '"')
  local provider=$(grep -o '"provider": *"[^"]*' "$AUTH_CONFIG_FILE" | sed 's/.*: *"//' | tr -d '"')
  local expires_at=$(grep -o '"expiresAt": *"[^"]*' "$AUTH_CONFIG_FILE" | sed 's/.*: *"//' | tr -d '"')
  
  echo "User Details:"
  echo "  Email:    $email"
  echo "  UID:      $uid"
  echo "  Provider: $provider"
  echo "  Expires:  $expires_at"
  echo ""
  
  # Check expiration
  if [ -n "$expires_at" ]; then
    local expires_ts=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${expires_at%%.*}" "+%s" 2>/dev/null || echo "0")
    local now_ts=$(date "+%s")
    
    if [ "$expires_ts" -gt "$now_ts" ]; then
      local remaining=$((expires_ts - now_ts))
      echo -e "${GREEN}Token valid${NC} - expires in $((remaining / 60)) minutes"
    else
      echo -e "${YELLOW}Token expired${NC} - will auto-refresh on next request"
    fi
  fi
  echo ""
  
  # Run CLI status
  log_info "CLI auth status:"
  run_cli auth status
  echo ""
}

# ============================================================================
# List Snapshots
# ============================================================================

list_snapshots() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}Available Snapshots${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  
  if [ ! -d "$SNAPSHOT_DIR" ] || [ -z "$(ls -A "$SNAPSHOT_DIR" 2>/dev/null)" ]; then
    echo "No snapshots found."
    echo ""
    echo "Create a snapshot with:"
    echo "  $0 --save-snapshot <name>"
    exit 0
  fi
  
  for snapshot in "$SNAPSHOT_DIR"/*.json; do
    local name=$(basename "$snapshot" .json)
    local email=$(jq -r '.auth.email' "$snapshot" 2>/dev/null || echo "unknown")
    local provider=$(jq -r '.auth.provider' "$snapshot" 2>/dev/null || echo "unknown")
    local created=$(jq -r '.created_at' "$snapshot" 2>/dev/null || echo "unknown")
    echo "  $name"
    echo "    Email:    $email"
    echo "    Provider: $provider"
    echo "    Created:  $created"
    echo ""
  done
}

# ============================================================================
# Usage
# ============================================================================

usage() {
  echo "Auth Method Comparison Test Script"
  echo ""
  echo "Usage:"
  echo "  $0 --save-snapshot <name>         Save current auth state as snapshot"
  echo "  $0 --compare <snap1> <snap2>      Compare two snapshots"
  echo "  $0 --check-status                 Show current auth status"
  echo "  $0 --list-snapshots               List all saved snapshots"
  echo "  $0 --help                         Show this help"
  echo ""
  echo "Example Workflow:"
  echo "  # Login with email and save snapshot"
  echo "  pairit auth login --provider email"
  echo "  $0 --save-snapshot email-user1"
  echo ""
  echo "  # Logout, login with Google, save snapshot"
  echo "  pairit auth logout"
  echo "  pairit auth login --provider google"
  echo "  $0 --save-snapshot google-user1"
  echo ""
  echo "  # Compare snapshots"
  echo "  $0 --compare email-user1 google-user1"
}

# ============================================================================
# Main
# ============================================================================

main() {
  if [ ! -f "$CLI_PATH" ]; then
    echo -e "${RED}ERROR:${NC} CLI not built at $CLI_PATH"
    echo "Build CLI with: pnpm --filter pairit-cli build"
    exit 1
  fi
  
  case "${1:-}" in
    --save-snapshot)
      if [ -z "${2:-}" ]; then
        echo "Usage: $0 --save-snapshot <name>"
        exit 1
      fi
      save_snapshot "$2"
      ;;
    --compare)
      if [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
        echo "Usage: $0 --compare <snapshot1> <snapshot2>"
        exit 1
      fi
      compare_snapshots "$2" "$3"
      ;;
    --check-status)
      check_status
      ;;
    --list-snapshots)
      list_snapshots
      ;;
    --help|-h|"")
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
}

main "$@"

