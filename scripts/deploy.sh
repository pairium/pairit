#!/bin/bash
set -e

# deploy.sh
# Deploys Pairit services to Google Cloud Run using Artifact Registry
# Usage: ./deploy.sh [PROJECT_ID] [REGION]

# Resolve script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "📂 Project Root: $PROJECT_ROOT"
cd "$PROJECT_ROOT"

# Read vars from .env (PROJECT_ID and secrets come from here)
if [ -f .env ]; then
    echo "📜 Sourcing .env..."
    set -a
    source .env
    set +a
else
    echo "❌ No .env file found in $PROJECT_ROOT"
    exit 1
fi

# Configuration (args override .env)
PROJECT_ID=${1:-$PROJECT_ID}
REGION=${2:-${REGION:-us-central1}}
REPO_NAME="pairit-repo"

# Service names
MANAGER_SERVICE="manager"
LAB_SERVICE="lab"

if [ -z "$PROJECT_ID" ]; then
    echo "❌ PROJECT_ID not set in .env and not provided as argument"
    echo "Usage: ./deploy.sh [PROJECT_ID] [REGION]"
    exit 1
fi

echo "🚀 Deploying to Project: $PROJECT_ID, Region: $REGION"

# Get project number to compute deterministic Cloud Run URLs
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
if [ -z "$PROJECT_NUMBER" ]; then
    echo "❌ Could not get project number for $PROJECT_ID"
    exit 1
fi

# Compute Cloud Run URLs (deterministic: service-projectnumber.region.run.app)
MANAGER_SERVICE_URL="https://${MANAGER_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
LAB_SERVICE_URL="https://${LAB_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"

echo "📍 Manager URL: $MANAGER_SERVICE_URL"
echo "📍 Lab URL: $LAB_SERVICE_URL"

# Check MONGODB_URI is set
if [ -n "$MONGODB_URI" ]; then
    echo "✅ MONGODB_URI is set"
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

# Prepare env vars with ++ delimiter to avoid comma conflicts in MONGODB_URI
MANAGER_ENV="NODE_ENV=production"
MANAGER_ENV="$MANAGER_ENV++MONGODB_URI=$MONGODB_URI"
MANAGER_ENV="$MANAGER_ENV++STORAGE_BACKEND=gcs"
MANAGER_ENV="$MANAGER_ENV++STORAGE_PATH=${STORAGE_PATH:-pairit-lab-media}"
MANAGER_ENV="$MANAGER_ENV++GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
MANAGER_ENV="$MANAGER_ENV++GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
MANAGER_ENV="$MANAGER_ENV++AUTH_SECRET=$AUTH_SECRET"
MANAGER_ENV="$MANAGER_ENV++AUTH_BASE_URL=${MANAGER_SERVICE_URL}"
MANAGER_ENV="$MANAGER_ENV++AUTH_TRUSTED_ORIGINS=${MANAGER_SERVICE_URL}"
MANAGER_ENV="$MANAGER_ENV++PAIRIT_LAB_URL=${LAB_SERVICE_URL}"

LAB_ENV="NODE_ENV=production"
LAB_ENV="$LAB_ENV++MONGODB_URI=$MONGODB_URI"
LAB_ENV="$LAB_ENV++STORAGE_BACKEND=gcs"
LAB_ENV="$LAB_ENV++STORAGE_PATH=${STORAGE_PATH:-pairit-lab-media}"
LAB_ENV="$LAB_ENV++GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
LAB_ENV="$LAB_ENV++GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
LAB_ENV="$LAB_ENV++AUTH_SECRET=$AUTH_SECRET"
LAB_ENV="$LAB_ENV++AUTH_BASE_URL=${LAB_SERVICE_URL}"
LAB_ENV="$LAB_ENV++AUTH_TRUSTED_ORIGINS=${LAB_SERVICE_URL}"
LAB_ENV="$LAB_ENV++OPENAI_API_KEY=${OPENAI_API_KEY}"

# Create temp files for Cloud Build configs
CLOUDBUILD_MANAGER=$(mktemp)
CLOUDBUILD_LAB=$(mktemp)

cat > "$CLOUDBUILD_MANAGER" <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '\$_IMAGE', '-f', 'Dockerfile.manager', '.']
images:
- '\$_IMAGE'
EOF

cat > "$CLOUDBUILD_LAB" <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '\$_IMAGE', '-f', 'Dockerfile.lab', '--build-arg', 'VITE_MANAGER_URL=\$_VITE_MANAGER_URL', '.']
images:
- '\$_IMAGE'
EOF

# 1. Build both images in parallel
echo "🔨 Building images in parallel..."
echo "   Manager: $MANAGER_IMAGE"
echo "   Lab: $LAB_IMAGE (with VITE_MANAGER_URL=$MANAGER_SERVICE_URL)"

# Create log files for build output
MANAGER_BUILD_LOG=$(mktemp)
LAB_BUILD_LOG=$(mktemp)

# Start Manager build in background
(
    gcloud builds submit \
        --config "$CLOUDBUILD_MANAGER" \
        --substitutions=_IMAGE="$MANAGER_IMAGE" \
        --project "$PROJECT_ID" \
        . > "$MANAGER_BUILD_LOG" 2>&1
) &
MANAGER_BUILD_PID=$!

# Start Lab build in background (using deterministic MANAGER_SERVICE_URL)
(
    gcloud builds submit \
        --config "$CLOUDBUILD_LAB" \
        --substitutions=_IMAGE="$LAB_IMAGE",_VITE_MANAGER_URL="$MANAGER_SERVICE_URL" \
        --project "$PROJECT_ID" \
        . > "$LAB_BUILD_LOG" 2>&1
) &
LAB_BUILD_PID=$!

# Wait for both builds to complete
MANAGER_BUILD_FAILED=0
LAB_BUILD_FAILED=0

wait $MANAGER_BUILD_PID || MANAGER_BUILD_FAILED=1
wait $LAB_BUILD_PID || LAB_BUILD_FAILED=1

# Check for build failures
if [ $MANAGER_BUILD_FAILED -eq 1 ]; then
    echo "❌ Manager Build Failed!"
    cat "$MANAGER_BUILD_LOG"
    rm -f "$CLOUDBUILD_MANAGER" "$CLOUDBUILD_LAB" "$MANAGER_BUILD_LOG" "$LAB_BUILD_LOG"
    exit 1
fi

if [ $LAB_BUILD_FAILED -eq 1 ]; then
    echo "❌ Lab Build Failed!"
    cat "$LAB_BUILD_LOG"
    rm -f "$CLOUDBUILD_MANAGER" "$CLOUDBUILD_LAB" "$MANAGER_BUILD_LOG" "$LAB_BUILD_LOG"
    exit 1
fi

echo "✅ Both images built successfully"
rm -f "$CLOUDBUILD_MANAGER" "$CLOUDBUILD_LAB" "$MANAGER_BUILD_LOG" "$LAB_BUILD_LOG"

# 2. Deploy both services in parallel
echo "📦 Deploying services in parallel..."

# Create log files for deployment output
MANAGER_DEPLOY_LOG=$(mktemp)
LAB_DEPLOY_LOG=$(mktemp)

# Start Manager deployment in background
(
    gcloud run deploy "$MANAGER_SERVICE" \
        --image "$MANAGER_IMAGE" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --set-env-vars "^++^$MANAGER_ENV" \
        --allow-unauthenticated > "$MANAGER_DEPLOY_LOG" 2>&1
) &
MANAGER_DEPLOY_PID=$!

# Start Lab deployment in background
(
    gcloud run deploy "$LAB_SERVICE" \
        --image "$LAB_IMAGE" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --port 3001 \
        --set-env-vars "^++^$LAB_ENV" \
        --allow-unauthenticated > "$LAB_DEPLOY_LOG" 2>&1
) &
LAB_DEPLOY_PID=$!

# Wait for both deployments to complete
MANAGER_DEPLOY_FAILED=0
LAB_DEPLOY_FAILED=0

wait $MANAGER_DEPLOY_PID || MANAGER_DEPLOY_FAILED=1
wait $LAB_DEPLOY_PID || LAB_DEPLOY_FAILED=1

# Check for deployment failures
if [ $MANAGER_DEPLOY_FAILED -eq 1 ]; then
    echo "❌ Manager Deployment Failed!"
    cat "$MANAGER_DEPLOY_LOG"
    rm -f "$MANAGER_DEPLOY_LOG" "$LAB_DEPLOY_LOG"
    exit 1
fi

if [ $LAB_DEPLOY_FAILED -eq 1 ]; then
    echo "❌ Lab Deployment Failed!"
    cat "$LAB_DEPLOY_LOG"
    rm -f "$MANAGER_DEPLOY_LOG" "$LAB_DEPLOY_LOG"
    exit 1
fi

echo "✅ Both services deployed successfully"
cat "$MANAGER_DEPLOY_LOG"
cat "$LAB_DEPLOY_LOG"
rm -f "$MANAGER_DEPLOY_LOG" "$LAB_DEPLOY_LOG"

# Get final Manager URL
MANAGER_URL=$(gcloud run services list --filter="SERVICE:$MANAGER_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format="value(URL)")
if [ -z "$MANAGER_URL" ]; then
    MANAGER_URL=$(gcloud run services describe "$MANAGER_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null)
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Manager: $MANAGER_URL"
echo "📍 Lab: $LAB_SERVICE_URL"
echo ""
echo "⚠️  POST-DEPLOYMENT CHECKLIST:"
echo "1. Add OAuth redirect URIs to Google Cloud Console:"
echo "   - ${MANAGER_URL}/api/auth/callback/google"
echo "   - ${LAB_SERVICE_URL}/api/auth/callback/google"
echo "2. Whitelist Cloud Run IPs in MongoDB Atlas (or use 0.0.0.0/0 for dev)"
echo "3. Verify IAM permissions for GCS bucket '${STORAGE_PATH:-pairit-lab-media}'"
