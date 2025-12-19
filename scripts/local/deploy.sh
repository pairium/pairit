#!/bin/bash
set -e

# scripts/local/deploy.sh
# Deploys Pairit services locally using Docker Compose

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "🚀 Starting Local Deployment..."

# Rebuild and start services
docker compose up -d --build

echo "⏳ Waiting for services to be ready..."

# Wait for MongoDB
echo "Waiting for MongoDB..."
until docker compose exec -T mongodb mongosh --eval "db.runCommand({ ping: 1 })" &>/dev/null; do
    printf "."
    sleep 1
done
echo "✅ MongoDB is ready."

# Wait for Lab Server
echo "Waiting for Lab Server..."
until curl -s http://localhost:3001/ &>/dev/null; do
    printf "."
    sleep 1
done
echo "✅ Lab Server is ready (http://localhost:3001)."

# Wait for Manager Server
echo "Waiting for Manager Server..."
until curl -s http://localhost:3002/ &>/dev/null; do
    printf "."
    sleep 1
done
echo "✅ Manager Server is ready (http://localhost:3002)."

echo "🎉 Local Deployment Complete!"
