#!/bin/bash
# Upload sample configs to production MongoDB
# Run after deploying to set up landing page demos

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default to production manager URL
PAIRIT_API_URL="${PAIRIT_API_URL:-https://manager-432501290611.us-central1.run.app}"

echo "Uploading sample configs to: $PAIRIT_API_URL"
echo ""

# Check if logged in
if ! bun run "$PROJECT_ROOT/apps/manager/cli/src/index.ts" config list &>/dev/null; then
    echo "Not logged in. Running login..."
    PAIRIT_API_URL="$PAIRIT_API_URL" bun run "$PROJECT_ROOT/apps/manager/cli/src/index.ts" login
fi

CONFIGS=(
    hello-world
    survey-showcase
    randomization-demo
    ai-chat
    team-decision
    ai-mediation
    multi-chat
)

for config in "${CONFIGS[@]}"; do
    echo "Uploading $config..."
    PAIRIT_API_URL="$PAIRIT_API_URL" bun run "$PROJECT_ROOT/apps/manager/cli/src/index.ts" config upload \
        "$PROJECT_ROOT/apps/lab/app/public/configs/$config.yaml" \
        --config-id "$config"
    echo ""
done

echo "Done! Sample configs uploaded."
