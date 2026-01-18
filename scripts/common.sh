#!/bin/bash
# scripts/common.sh
# Shared utilities for Pairit scripts

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}$1${NC}"; }
log_success() { echo -e "${GREEN}$1${NC}"; }
log_warn() { echo -e "${YELLOW}$1${NC}"; }
log_error() { echo -e "${RED}$1${NC}"; }

# Test result functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++)) || true
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++)) || true
}
