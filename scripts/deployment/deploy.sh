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
    source .env.production
elif [ -f .env ]; then
    echo "📜 Sourcing .env..."
    source .env
else
    echo "⚠️  No .env or .env.production file found in $PROJECT_ROOT. Ensure environment variables are set explicitly."
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

# 1. Build and Deploy Lab Server
echo "🔨 Building Lab Server Image: $LAB_IMAGE"
gcloud builds submit --config cloudbuild.lab.yaml --project "$PROJECT_ID" --substitutions=_IMAGE_NAME="$LAB_IMAGE" .

echo "📦 Deploying Lab Server..."
gcloud run deploy pairit-lab \
    --image "$LAB_IMAGE" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --set-env-vars="MONGODB_URI=$MONGODB_URI,STORAGE_BACKEND=gcs,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,AUTH_SECRET=$AUTH_SECRET,AUTH_BASE_URL=https://pairit-lab-823036187164.us-central1.run.app/api/auth" \
    --allow-unauthenticated

# 2. Build and Deploy Manager Server
echo "🔨 Building Manager Server Image: $MANAGER_IMAGE"
gcloud builds submit --config cloudbuild.manager.yaml --project "$PROJECT_ID" --substitutions=_IMAGE_NAME="$MANAGER_IMAGE" .

echo "📦 Deploying Manager Server..."
gcloud run deploy pairit-manager \
    --image "$MANAGER_IMAGE" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --set-env-vars="MONGODB_URI=$MONGODB_URI,STORAGE_BACKEND=gcs,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,AUTH_SECRET=$AUTH_SECRET,AUTH_BASE_URL=https://pairit-manager-823036187164.us-central1.run.app/api/auth" \
    --allow-unauthenticated

echo "✅ Deployment initiated!"
echo "⚠️  IMPORTANT POST-DEPLOYMENT STEPS:"
echo "1. Go to Cloud Console and update AUTH_BASE_URL env var for each service with their assigned URLs."
echo "2. Update your Google OAuth Credentials authorized redirect URIs with the new URLs ending in /api/auth/callback/google"
