#!/bin/bash
set -e

# Re-uploads all example configs from configs/ with LLM credentials.
# Reads OPENAI_API_KEY and ANTHROPIC_API_KEY from .env.
#
# Usage: bash scripts/upload-example-configs.sh
# Override target: PAIRIT_API_URL=https://... bash scripts/upload-example-configs.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Save any env vars passed on the command line before sourcing .env
SAVED_PAIRIT_API_URL="${PAIRIT_API_URL:-}"

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Command-line override takes precedence over .env
if [ -n "$SAVED_PAIRIT_API_URL" ]; then
    export PAIRIT_API_URL="$SAVED_PAIRIT_API_URL"
fi

# Build credential flags from env
CRED_FLAGS=()
if [ -n "$OPENAI_API_KEY" ]; then
    CRED_FLAGS+=(--openai-api-key "$OPENAI_API_KEY")
fi
if [ -n "$ANTHROPIC_API_KEY" ]; then
    CRED_FLAGS+=(--anthropic-api-key "$ANTHROPIC_API_KEY")
fi

if [ ${#CRED_FLAGS[@]} -eq 0 ]; then
    echo "⚠️  No OPENAI_API_KEY or ANTHROPIC_API_KEY found in .env — uploading without credentials"
fi

# Configs that use agents and need LLM credentials
AGENT_CONFIGS=(
    ai-chat
    ai-mediation
    multi-chat
    workspace
    agent-triggers
    conditional-agent
)

# Configs without agents (no credentials needed)
PLAIN_CONFIGS=(
    hello-world
    component-events
    survey-only
    timer-demo
    randomization-demo
    team-decision
)

echo "📦 Uploading agent configs (with credentials)..."
for name in "${AGENT_CONFIGS[@]}"; do
    config_file="configs/${name}.yaml"
    if [ -f "$config_file" ]; then
        echo "  → $name"
        bunx pairit config upload "$config_file" --config-id "$name" "${CRED_FLAGS[@]}"
    else
        echo "  ⚠️  $config_file not found, skipping"
    fi
done

echo ""
echo "📦 Uploading plain configs (no credentials)..."
for name in "${PLAIN_CONFIGS[@]}"; do
    config_file="configs/${name}.yaml"
    if [ -f "$config_file" ]; then
        echo "  → $name"
        bunx pairit config upload "$config_file" --config-id "$name"
    else
        echo "  ⚠️  $config_file not found, skipping"
    fi
done

echo ""
echo "✅ Done"
