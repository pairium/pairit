#!/bin/bash
set -euo pipefail

# Re-uploads all example configs from configs/ with LLM credentials.
# Reads OPENAI_API_KEY and ANTHROPIC_API_KEY from .env (or the environment).
# Uses the CLI from this checkout, not a published one.
#
# The target must be explicit, so a missing .env never uploads to production:
#   bash scripts/upload-example-configs.sh                     # PAIRIT_API_URL from .env (local)
#   PAIRIT_ENV=staging bash scripts/upload-example-configs.sh  # staging
#   PAIRIT_API_URL=https://... bash scripts/upload-example-configs.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Save any env vars passed on the command line before sourcing .env
SAVED_PAIRIT_API_URL="${PAIRIT_API_URL:-}"
SAVED_PAIRIT_ENV="${PAIRIT_ENV:-}"

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Command-line overrides take precedence over .env
if [ -n "$SAVED_PAIRIT_API_URL" ]; then
    export PAIRIT_API_URL="$SAVED_PAIRIT_API_URL"
fi
if [ -n "$SAVED_PAIRIT_ENV" ]; then
    export PAIRIT_ENV="$SAVED_PAIRIT_ENV"
    # An explicit environment wins over a localhost URL from .env
    if [ -z "$SAVED_PAIRIT_API_URL" ]; then
        unset PAIRIT_API_URL PAIRIT_LAB_URL
    fi
fi

if [ -z "${PAIRIT_API_URL:-}" ] && [ -z "${PAIRIT_ENV:-}" ]; then
    echo "❌ No target. Set PAIRIT_API_URL (e.g. in .env) or PAIRIT_ENV=staging|production." >&2
    exit 1
fi

CLI=(bun run "$PROJECT_ROOT/apps/manager/cli/src/index.ts")
echo "Target: ${PAIRIT_API_URL:-$PAIRIT_ENV}"

# Keys are passed by variable name, so they never appear on a command line
CRED_FLAGS=()
if [ -n "${OPENAI_API_KEY:-}" ]; then
    export OPENAI_API_KEY
    CRED_FLAGS+=(--openai-api-key-env OPENAI_API_KEY)
fi
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    export ANTHROPIC_API_KEY
    CRED_FLAGS+=(--anthropic-api-key-env ANTHROPIC_API_KEY)
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
    split-demo
)

# Configs without agents (no credentials needed)
PLAIN_CONFIGS=(
    hello-world
    component-events
    survey-only
    timer-demo
    randomization-demo
    team-decision
    html-demo
)

echo "📦 Uploading agent configs (with credentials)..."
for name in "${AGENT_CONFIGS[@]}"; do
    config_file="configs/${name}.yaml"
    if [ -f "$config_file" ]; then
        echo "  → $name"
        "${CLI[@]}" config upload "$config_file" --config-id "$name" ${CRED_FLAGS[@]+"${CRED_FLAGS[@]}"}
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
        "${CLI[@]}" config upload "$config_file" --config-id "$name"
    else
        echo "  ⚠️  $config_file not found, skipping"
    fi
done

echo ""
echo "✅ Done"
