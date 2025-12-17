#!/bin/bash
set -e

# verify-production.sh
# Automates E2E testing of the production Docker stack

echo "🔍 Checking environment..."
if [ ! -f .env ]; then
    echo "⚠️  .env file not found! Docker Compose might fail if variables are missing."
    echo "Please copy .env.example to .env and fill in required values."
    # We continue, assuming maybe vars are in shell env
fi

echo "🐳 Building and starting production stack..."
# Ensure fresh start
docker compose down
# Build and start, verify services are running
docker compose up -d --build --wait

echo "✅ Stack is up!"
echo "   Lab Server: http://localhost:3001"
echo "   Manager Server: http://localhost:3002"
echo "   MongoDB: localhost:27017"

echo "🧪 Running CLI verification tests..."
# Run the CLI test script against the running manager server
export PAIRIT_API_URL="http://localhost:3002"
./tests/auth/test-cli.sh

echo "🧪 Verifying Lab Server health..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/)
if [ "$STATUS" -eq 200 ] || [ "$STATUS" -eq 304 ]; then
    echo "✓ Lab Server is responding ($STATUS)"
else
    echo "✗ Lab Server failed health check ($STATUS)"
    exit 1
fi

echo "🎉 E2E Verification Passed!"
echo "To clean up, run: docker compose down"
