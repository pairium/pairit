#!/bin/bash
set -e

# deploy.sh
# Deploys Pairit services to Google Cloud Run using Artifact Registry
# Usage: ./deploy.sh [PROJECT_ID] [REGION]

# Resolve script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "📂 Project Root: $PROJECT_ROOT"
cd "$PROJECT_ROOT"

# Default configuration
DEFAULT_PROJECT_ID="pairit-lab-staging"
DEFAULT_REGION="us-central1"

PROJECT_ID=${1:-$(gcloud config get-value project || echo "$DEFAULT_PROJECT_ID")}
REGION=${2:-$DEFAULT_REGION}
REPO_NAME="pairit-repo"

if [ -z "$PROJECT_ID" ]; then
    echo "Error: No Google Cloud Project ID found."
    echo "Usage: ./deploy.sh [PROJECT_ID] [REGION]"
    exit 1
fi

echo "🚀 Deploying to Project: $PROJECT_ID, Region: $REGION"

# Read vars from .env for injection
# Priority: .env.production > .env (we are now in PROJECT_ROOT)
if [ -f .env.production ]; then
    echo "📜 Sourcing .env.production..."
    set -a
    source .env.production
    set +a
elif [ -f .env ]; then
    echo "📜 Sourcing .env..."
    set -a
    source .env
    set +a
else
    echo "⚠️  No .env or .env.production file found in $PROJECT_ROOT. Ensure environment variables are set explicitly."
fi

# Debug: Redact and show MONGODB_URI
if [ -n "$MONGODB_URI" ]; then
    echo "🔍 MONGODB_URI is set (starts with ${MONGODB_URI:0:15}...)"
else
    echo "❌ MONGODB_URI is NOT set in the deployment shell!"
fi

# 0. Setup Artifact Registry
echo "🔧 Checking Artifact Registry..."
# Enable API
gcloud services enable artifactregistry.googleapis.com --project "$PROJECT_ID" || true
# Create repo if not exists
if ! gcloud artifacts repositories describe "$REPO_NAME" --project "$PROJECT_ID" --location "$REGION" &>/dev/null; then
    echo "📦 Creating Artifact Registry Repository: $REPO_NAME..."
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="Docker repository for Pairit" \
        --project="$PROJECT_ID"
else
    echo "✅ Repository $REPO_NAME exists."
fi

# Define Image Paths
LAB_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/pairit-lab"
MANAGER_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/pairit-manager"

# 1. Build and Deploy Manager Server
echo "🔨 Building Manager Server Image: $MANAGER_IMAGE"
CLOUDBUILD_MANAGER=$(mktemp)
cat > "$CLOUDBUILD_MANAGER" <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '\$_IMAGE', '-f', 'Dockerfile.manager', '.']
images:
- '\$_IMAGE'
EOF

gcloud builds submit \
    --config "$CLOUDBUILD_MANAGER" \
    --substitutions=_IMAGE="$MANAGER_IMAGE" \
    --project "$PROJECT_ID" \
    .
rm "$CLOUDBUILD_MANAGER"

# Prepare env vars with ++ delimiter to avoid comma conflicts
    MANAGER_ENV="NODE_ENV=production"
    MANAGER_ENV="$MANAGER_ENV++MONGODB_URI=$MONGODB_URI"
    MANAGER_ENV="$MANAGER_ENV++STORAGE_BACKEND=gcs"
    MANAGER_ENV="$MANAGER_ENV++STORAGE_PATH=${STORAGE_PATH:-pairit-media-prod}"
    MANAGER_ENV="$MANAGER_ENV++GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
    MANAGER_ENV="$MANAGER_ENV++GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
    MANAGER_ENV="$MANAGER_ENV++AUTH_SECRET=$AUTH_SECRET"
    MANAGER_ENV="$MANAGER_ENV++AUTH_BASE_URL=${AUTH_BASE_URL}"
    MANAGER_ENV="$MANAGER_ENV++AUTH_TRUSTED_ORIGINS=${AUTH_TRUSTED_ORIGINS}"
    MANAGER_ENV="$MANAGER_ENV++PAIRIT_LAB_URL=${PAIRIT_LAB_URL}"
    MANAGER_ENV="$MANAGER_ENV++CORS_ORIGINS=${CORS_ORIGINS}"

    echo "📦 Deploying Manager Server..."
    if ! DEPLOY_OUTPUT=$(gcloud run deploy pairit-manager \
        --image "$MANAGER_IMAGE" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --set-env-vars "^++^$MANAGER_ENV" \
        --allow-unauthenticated 2>&1); then
        echo "❌ Manager Deployment Failed!"
        echo "$DEPLOY_OUTPUT"
        exit 1
    fi

echo "$DEPLOY_OUTPUT"

# Extract Service URL using list for consistency (always returns the new deterministic URL)
MANAGER_URL=$(gcloud run services list --filter="SERVICE:pairit-manager" --project "$PROJECT_ID" --region "$REGION" --format="value(URL)")

if [ -z "$MANAGER_URL" ]; then
    echo "⚠️  Could not find Manager URL via list. Checking via describe as fallback..."
    MANAGER_URL=$(gcloud run services describe pairit-manager --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null)
fi

echo "🔗 Final Manager URL: $MANAGER_URL"

# 2. Build and Deploy Lab Server
echo "🔨 Building Lab Server Image: $LAB_IMAGE with MANAGER_URL=$MANAGER_URL"
CLOUDBUILD_LAB=$(mktemp)
cat > "$CLOUDBUILD_LAB" <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '\$_IMAGE', '-f', 'Dockerfile.lab', '--build-arg', 'VITE_MANAGER_URL=\$_VITE_MANAGER_URL', '.']
images:
- '\$_IMAGE'
EOF

gcloud builds submit \
    --config "$CLOUDBUILD_LAB" \
    --substitutions=_IMAGE="$LAB_IMAGE",_VITE_MANAGER_URL="$MANAGER_URL" \
    --project "$PROJECT_ID" \
    .
rm "$CLOUDBUILD_LAB"

# Prepare env vars with ++ delimiter
    LAB_ENV="NODE_ENV=production"
    LAB_ENV="$LAB_ENV++MONGODB_URI=$MONGODB_URI"
    LAB_ENV="$LAB_ENV++STORAGE_BACKEND=gcs"
    LAB_ENV="$LAB_ENV++GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
    LAB_ENV="$LAB_ENV++GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
    LAB_ENV="$LAB_ENV++AUTH_SECRET=$AUTH_SECRET"
    LAB_ENV="$LAB_ENV++AUTH_BASE_URL=${AUTH_BASE_URL_LAB}"
    LAB_ENV="$LAB_ENV++AUTH_TRUSTED_ORIGINS=${AUTH_TRUSTED_ORIGINS_LAB}"
    LAB_ENV="$LAB_ENV++CORS_ORIGINS=${CORS_ORIGINS_LAB}"

    echo "📦 Deploying Lab Server..."
    if ! LAB_DEPLOY_OUTPUT=$(gcloud run deploy pairit-lab \
        --image "$LAB_IMAGE" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --set-env-vars "^++^$LAB_ENV" \
        --allow-unauthenticated 2>&1); then
        echo "❌ Lab Deployment Failed!"
        echo "$LAB_DEPLOY_OUTPUT"
        exit 1
    fi
echo "$LAB_DEPLOY_OUTPUT"

echo "✅ Deployment initiated!"
echo "⚠️  IMPORTANT POST-DEPLOYMENT STEPS:"
echo "1. Verify AUTH_BASE_URL and AUTH_TRUSTED_ORIGINS match your actual Cloud Run URL."
echo "2. Update your Google OAuth Credentials authorized redirect URIs."
echo "3. IAM Permissions Verify:"
echo "   - Cloud Run Service Account must have 'roles/storage.objectAdmin' on bucket '${STORAGE_PATH:-pairit-media-prod}'."
echo "   - Cloud Run Service Account must have 'roles/iam.serviceAccountTokenCreator' on itself."
