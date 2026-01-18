#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

# Ensure CLI hits the configured API
if [ -z "$PAIRIT_API_URL" ] && [ -f .env ]; then
    # Load from .env if not set
    set -a
    source .env
    set +a
fi

if [ -z "$PAIRIT_API_URL" ]; then
    log_error "Error: PAIRIT_API_URL is not set. Please set it or create a .env file."
    exit 1
fi

# Wrapper function to handle 401s
run_pairit() {
    local output
    local status
    
    # Temporarily disable set -e to handle errors manually
    set +e
    output=$("$@" 2>&1)
    status=$?
    set -e

    # Check for 401 Unauthorized
    if echo "$output" | grep -i -q "401"; then
        log_warn "⚠️  Received 401 Unauthorized for command: $*"
        log_warn "   Launching 'pairit login' for manual authentication..."
        log_warn "   (Please complete the login in your browser/terminal)"
        
        # Run login interactively (allows user verification)
        pairit login
        
        log_info "Retrying original command..."
        # Retry once
        set +e
        output=$("$@" 2>&1)
        status=$?
        set -e
    fi

    echo "$output"

    # If it failed (and wasn't fixed by login retry), return the error status
    if [ $status -ne 0 ]; then
        return $status
    fi

    return 0
}

log_info "Starting full CLI verification..."

# Resolve script directory for test artifacts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Setup
log_info "1. Setup: Creating dummy files..."
TEST_MEDIA="$SCRIPT_DIR/test-media-$(date +%s).txt"
echo "Hello Pairit Integration Test" > "$TEST_MEDIA"
log_success "✓ Created $TEST_MEDIA"

# 2. Config Verification
log_info "---------------------------------------------------"
log_info "2. Testing Config Management..."

CONFIG_FILE="apps/lab/app/public/configs/simple-survey.yaml"

if [ ! -f "$CONFIG_FILE" ]; then
    log_error "Error: Config file $CONFIG_FILE not found."
    exit 1
fi

# Generate unique config ID for this test run to avoid ownership conflicts
TEST_CONFIG_ID="test-$(date +%s)-$(head -c 4 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 8)"

log_info "> Linting..."
run_pairit pairit config lint "$CONFIG_FILE" > /dev/null
log_success "✓ Lint passed"

log_info "> Compiling..."
run_pairit pairit config compile "$CONFIG_FILE" > /dev/null
log_success "✓ Compile passed"

log_info "> Uploading config with ID: $TEST_CONFIG_ID..."
set +e
UPLOAD_OUT=$(run_pairit pairit config upload "$CONFIG_FILE" --config-id "$TEST_CONFIG_ID")
UPLOAD_STATUS=$?
set -e

if [ $UPLOAD_STATUS -ne 0 ]; then
    log_error "❌ Upload failed"
    echo "$UPLOAD_OUT"
    exit $UPLOAD_STATUS
fi
echo "$UPLOAD_OUT"

# Parse Config ID
# Expect format: ✓ Uploaded <ID> (...)
CONFIG_ID=$(echo "$UPLOAD_OUT" | grep "Uploaded" | awk '{print $3}')

if [ -z "$CONFIG_ID" ]; then
    log_error "Error: Could not extract Config ID from upload output."
    log_error "Output was: $UPLOAD_OUT"
    exit 1
fi

log_success "Uploaded Config ID: $CONFIG_ID"

log_info "> Listing..."
set +e
LIST_OUT=$(run_pairit pairit config list)
LIST_STATUS=$?
set -e

if [ $LIST_STATUS -ne 0 ]; then
    log_error "❌ List failed"
    echo "$LIST_OUT"
    exit $LIST_STATUS
fi
echo "$LIST_OUT"

if echo "$LIST_OUT" | grep -q "$CONFIG_ID"; then
    log_success "✓ Found config $CONFIG_ID in list"
else
    log_error "Error: Config $CONFIG_ID not found in list output."
    exit 1
fi

log_info "> Deleting Config $CONFIG_ID..."
run_pairit pairit config delete "$CONFIG_ID" --force > /dev/null
log_success "✓ Deleted $CONFIG_ID"

# 3. Media Verification
log_info "---------------------------------------------------"
log_info "3. Testing Media Management..."

log_info "> Uploading Media..."
set +e
MEDIA_OUT=$(run_pairit pairit media upload "$TEST_MEDIA")
MEDIA_STATUS=$?
set -e

if [ $MEDIA_STATUS -ne 0 ]; then
    log_error "❌ Media Upload failed"
    echo "$MEDIA_OUT"
    exit $MEDIA_STATUS
fi
echo "$MEDIA_OUT"

# Extract object name from upload output
# Expect format: ✓ Uploaded media <OBJECT> (...)
OBJECT_NAME=$(echo "$MEDIA_OUT" | grep "Uploaded" | awk '{print $4}')

if [ -z "$OBJECT_NAME" ]; then
    log_error "Error: Could not extract Object Name from upload output."
    log_error "Output was: $MEDIA_OUT"
    exit 1
fi

log_success "Uploaded Object: $OBJECT_NAME"

log_info "> Listing Media..."
run_pairit pairit media list | grep "$OBJECT_NAME"
log_success "✓ Found object in list"

log_info "> Deleting Media $OBJECT_NAME..."
run_pairit pairit media delete "$OBJECT_NAME" --force > /dev/null
log_success "✓ Deleted $OBJECT_NAME"

# 4. Cleanup
log_info "---------------------------------------------------"
log_info "4. Cleanup..."
rm "$TEST_MEDIA"
# JSON config is a tracked file, do not delete it.

log_success "✓ Full CLI verification completed successfully!"
