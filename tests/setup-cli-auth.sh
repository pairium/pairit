#!/bin/bash
set -e

# setup-cli-auth.sh
# Automates CLI authentication by obtaining a session token via API
# and writing it to ~/.pairit/credentials.json

API_URL=$1
EMAIL=$2
PASSWORD=$3

if [ -z "$API_URL" ] || [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
    echo "Usage: ./setup-cli-auth.sh [API_URL] [EMAIL] [PASSWORD]"
    exit 1
fi

echo "🔐 Setting up CLI Auth for $EMAIL at $API_URL..."

# 1. Try Signup (ignore failure if already exists)
# echo "Attempting signup..."
curl -s -X POST "$API_URL/api/auth/sign-up/email" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Test User\"}" > /dev/null || true

# 2. Signin to get cookie
COOKIE_FILE=$(mktemp)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/sign-in/email" \
    -H "Content-Type: application/json" \
    -c "$COOKIE_FILE" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ Signin failed with code $HTTP_CODE"
    rm "$COOKIE_FILE"
    exit 1
fi

# 3. Extract Cookies
# Read Netscape cookie format, skipping comments/headers
# Format: domain flag path secure expiry name value
# We want name=value pairs joined by "; "
COOKIES=$(grep "better-auth" "$COOKIE_FILE" | awk '{print $6 "=" $7}' | tr '\n' '; ' | sed 's/; $//')

rm "$COOKIE_FILE"

if [ -z "$COOKIES" ]; then
    echo "❌ Could not extract cookies from response"
    exit 1
fi

# 4. Write to ~/.pairit/credentials.json
CONFIG_DIR="$HOME/.pairit"
CREDENTIALS_FILE="$CONFIG_DIR/credentials.json"

mkdir -p "$CONFIG_DIR"
# Use Python to verify JSON string escaping if needed, but for cookies usually simple
# We'll use python to write JSON safely
python3 -c "import sys, json; print(json.dumps({'cookie': sys.argv[1]}))" "$COOKIES" > "$CREDENTIALS_FILE"

echo "✅ Auth configured! Token saved to $CREDENTIALS_FILE"
