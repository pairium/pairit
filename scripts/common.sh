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

# load_env_file <file>
# Reads KEY=VALUE lines into exported shell variables without running the file
# as code: no command substitution, no $VAR expansion, no other statements.
# Allows a leading "export", spaces around "=", single or double quotes around
# the value, and "# comments" after an unquoted value. Fails on any other line.
load_env_file() {
    local file=$1
    local line key value lineno=0
    local kv_re='^[[:space:]]*(export[[:space:]]+)?([A-Z][A-Z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$'
    local dq_re='^"(.*)"[[:space:]]*(#.*)?$'
    local sq_re="^'(.*)'[[:space:]]*(#.*)?\$"
    while IFS= read -r line || [ -n "$line" ]; do
        lineno=$((lineno + 1))
        line="${line%$'\r'}"
        if [[ "$line" =~ ^[[:space:]]*(#.*)?$ ]]; then
            continue
        fi
        if [[ ! "$line" =~ $kv_re ]]; then
            echo "❌ $file line $lineno is not KEY=VALUE." >&2
            return 1
        fi
        key="${BASH_REMATCH[2]}"
        value="${BASH_REMATCH[3]}"
        case "$key" in
            PATH | IFS | HOME | SHELL | ENV | BASH_ENV | SHELLOPTS | BASHOPTS | PS4 | PROMPT_COMMAND | LD_* | DYLD_* | GIT_* | CLOUDSDK_* | GOOGLE_APPLICATION_CREDENTIALS)
                echo "❌ $file line $lineno sets $key, which an env file may not set." >&2
                return 1
                ;;
        esac
        if [[ "$value" =~ $dq_re ]] || [[ "$value" =~ $sq_re ]]; then
            value="${BASH_REMATCH[1]}"
        else
            value="${value%%[[:space:]]#*}"
            value="${value%"${value##*[![:space:]]}"}"
        fi
        printf -v "$key" '%s' "$value"
        export "${key?}"
    done < "$file"
}
