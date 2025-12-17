#!/bin/bash
set -e

# CLI Test Script
# Usage: ./tests/auth/test-cli.sh (or from anywhere)

# Get the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building CLI..."
cd "$PROJECT_ROOT/manager/cli"
bun install
bun run build
cd "$PROJECT_ROOT"

CLI="$PROJECT_ROOT/manager/cli/dist/index.js"

echo "Testing CLI..."

# 1. Test Help
echo "1. Testing Help..."
node "$CLI" --help > /dev/null
echo "✓ Help command works"

# 2. Test Lint
echo "2. Testing Lint..."
# Create a dummy config in a temp location or locally
TEST_CONFIG="$SCRIPT_DIR/test-config.yaml"
echo "schema_version: v2
initialPageId: intro
pages:
  - id: intro
    components: []
" > "$TEST_CONFIG"

node "$CLI" config lint "$TEST_CONFIG"
echo "✓ Lint command works"

# 3. Test Compile
echo "3. Testing Compile..."
node "$CLI" config compile "$TEST_CONFIG"
TEST_CONFIG_JSON="${TEST_CONFIG%.yaml}.json"
if [ -f "$TEST_CONFIG_JSON" ]; then
    echo "✓ Compile command works"
    rm "$TEST_CONFIG_JSON"
else
    echo "✗ Compile command failed"
    rm "$TEST_CONFIG"
    exit 1
fi

rm "$TEST_CONFIG"

echo "✓ Basic CLI tests passed!"
echo "Note: Auth/Upload commands require manual verification or mocked env."
