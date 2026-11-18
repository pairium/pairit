#!/bin/bash
set -e

# deploy.sh
# Deploys Pairit services to Google Cloud Run using Artifact Registry
# Usage: ./scripts/deploy.sh staging|production [REGION]
#
# staging    loads .env.staging    (database name must contain "staging")
# production loads .env.production (database name must not contain "staging")
# Local dev keeps using .env. This script never reads .env.
#
# Secrets go to Secret Manager, and each service runs as its own service
# account (pairit-lab, pairit-manager). The account that runs this script
# needs roles/secretmanager.admin; see docs/docs/dev/deployment.md.

# Resolve script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

# Temp files are removed however the script exits.
TMP_FILES=()
cleanup() {
    if [ ${#TMP_FILES[@]} -gt 0 ]; then
        rm -f "${TMP_FILES[@]}"
    fi
}
trap cleanup EXIT
make_temp() {
    local file
    file=$(mktemp)
    TMP_FILES+=("$file")
    printf '%s\n' "$file"
}

echo "📂 Project Root: $PROJECT_ROOT"
cd "$PROJECT_ROOT"

TARGET=${1:-}
REGION_ARG=${2:-}

if [ "$TARGET" != "staging" ] && [ "$TARGET" != "production" ]; then
    echo "❌ Say which environment to deploy."
    echo "Usage: ./scripts/deploy.sh staging|production [REGION]"
    exit 1
fi

# Sessions record GIT_SHA as their lab version, so it must name the code
# being deployed. ALLOW_DIRTY=1 deploys anyway and marks the version "-dirty".
GIT_SHA=$(git rev-parse --short=12 HEAD)
if [ -n "$(git status --porcelain)" ]; then
    if [ "${ALLOW_DIRTY:-}" != "1" ]; then
        echo "❌ Uncommitted changes. Commit or stash them so sessions record the exact code version."
        echo "   To deploy anyway (version will end in -dirty): ALLOW_DIRTY=1 ./scripts/deploy.sh $TARGET"
        exit 1
    fi
    GIT_SHA="${GIT_SHA}-dirty"
fi
echo "🔖 Version: $GIT_SHA"

ENV_FILE=".env.$TARGET"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Missing $ENV_FILE in $PROJECT_ROOT"
    echo "Copy env.template to $ENV_FILE and fill in that environment's project, database, and OAuth keys."
    exit 1
fi

# Parsed as KEY=VALUE lines, never run as a shell script.
echo "📜 Reading $ENV_FILE..."
load_env_file "$ENV_FILE"

REGION=${REGION_ARG:-${REGION:-us-central1}}
REPO_NAME="pairit-repo"

# Service names
MANAGER_SERVICE="manager"
LAB_SERVICE="lab"

# Runtime service accounts. Each service gets only the secrets it reads.
LAB_SA_NAME="pairit-lab"
MANAGER_SA_NAME="pairit-manager"

for required in PROJECT_ID MONGODB_URI STORAGE_PATH AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
    if [ -z "${!required:-}" ]; then
        echo "❌ $required is not set in $ENV_FILE"
        if [ "$required" = "STORAGE_PATH" ]; then
            echo "Each environment needs its own media bucket name."
        fi
        exit 1
    fi
done

# Values committed to this repo (env.template, the dev default) are public.
for secret_key in AUTH_SECRET MANAGER_AUTH_SECRET; do
    case "${!secret_key:-}" in
        "local-development-secret-must-be-32-chars-long" | "development-secret-do-not-use-in-production-32chars")
            echo "❌ $secret_key in $ENV_FILE is the public example value. Generate one: openssl rand -hex 32"
            exit 1
            ;;
    esac
done
if [ "${#AUTH_SECRET}" -lt 32 ]; then
    echo "❌ AUTH_SECRET in $ENV_FILE is shorter than 32 characters."
    exit 1
fi
if [ -n "${MANAGER_AUTH_SECRET:-}" ] && [ "${#MANAGER_AUTH_SECRET}" -lt 32 ]; then
    echo "❌ MANAGER_AUTH_SECRET in $ENV_FILE is shorter than 32 characters."
    exit 1
fi
if [ "$(printf '%s' "${CREDENTIALS_ENCRYPTION_KEY:-}" | tr 'A-F' 'a-f')" = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" ]; then
    echo "❌ CREDENTIALS_ENCRYPTION_KEY in $ENV_FILE is the public example value. Generate one: openssl rand -hex 32"
    exit 1
fi

# Same database-name rule as packages/db: the path on the Mongo address.
DB_NAME=$(bun -e 'const u = new URL(process.argv[1]); const name = decodeURIComponent(u.pathname.replace(/^\//, "")); if (!name) process.exit(2); console.log(name);' "$MONGODB_URI") || {
    echo "❌ Could not read the database name from MONGODB_URI in $ENV_FILE"
    exit 1
}

if [ "$TARGET" = "staging" ]; then
    case "$DB_NAME" in
        *staging*) ;;
        *)
            echo "❌ Staging deploy refused. Database is '$DB_NAME'."
            echo "Staging must use a database whose name contains 'staging' (pairit-staging)."
            exit 1
            ;;
    esac
else
    case "$DB_NAME" in
        *staging*)
            echo "❌ Production deploy refused. Database is '$DB_NAME'."
            echo "Production must not use the staging database."
            exit 1
            ;;
    esac
fi

# Last KEY=value in a file. Allows a leading "export", spaces around "=", and quotes.
env_value() {
    local file=$1
    local key=$2
    local raw
    raw=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$file" | tail -1 | cut -d= -f2- || true)
    raw="${raw#"${raw%%[![:space:]]*}"}"
    raw="${raw%"${raw##*[![:space:]]}"}"
    raw="${raw#\"}"
    raw="${raw%\"}"
    raw="${raw#\'}"
    raw="${raw%\'}"
    printf '%s\n' "$raw"
}

OTHER_FILE=".env.production"
if [ "$TARGET" = "production" ]; then
    OTHER_FILE=".env.staging"
fi
if [ -f "$OTHER_FILE" ]; then
    OTHER_PROJECT=$(env_value "$OTHER_FILE" PROJECT_ID)
    OTHER_URI=$(env_value "$OTHER_FILE" MONGODB_URI)
    OTHER_BUCKET=$(env_value "$OTHER_FILE" STORAGE_PATH)
    OTHER_AUTH_SECRET=$(env_value "$OTHER_FILE" AUTH_SECRET)
    OTHER_CREDENTIALS_KEY=$(env_value "$OTHER_FILE" CREDENTIALS_ENCRYPTION_KEY)
    if [ -n "$OTHER_PROJECT" ] && [ "$OTHER_PROJECT" = "$PROJECT_ID" ]; then
        echo "❌ $ENV_FILE and $OTHER_FILE use the same PROJECT_ID ($PROJECT_ID)."
        echo "Staging and production must be different Google projects."
        exit 1
    fi
    if [ -n "$OTHER_URI" ]; then
        OTHER_DB=$(bun -e 'const u = new URL(process.argv[1]); console.log(decodeURIComponent(u.pathname.replace(/^\//, "")));' "$OTHER_URI" 2>/dev/null || true)
        if [ -n "$OTHER_DB" ] && [ "$OTHER_DB" = "$DB_NAME" ]; then
            echo "❌ $ENV_FILE and $OTHER_FILE use the same database ($DB_NAME)."
            exit 1
        fi
    fi
    if [ -n "$OTHER_BUCKET" ] && [ "$OTHER_BUCKET" = "$STORAGE_PATH" ]; then
        echo "❌ $ENV_FILE and $OTHER_FILE use the same media bucket ($STORAGE_PATH)."
        echo "Staging and production must use different buckets."
        exit 1
    fi
    if [ -n "$OTHER_AUTH_SECRET" ] && [ "$OTHER_AUTH_SECRET" = "$AUTH_SECRET" ]; then
        echo "❌ $ENV_FILE and $OTHER_FILE use the same AUTH_SECRET."
        echo "Give staging its own: openssl rand -hex 32 (staging sign-ins end, and staging chat member IDs change unless MEMBER_ID_SECRET is set)."
        exit 1
    fi
    if [ -n "$OTHER_CREDENTIALS_KEY" ] && [ "$OTHER_CREDENTIALS_KEY" = "${CREDENTIALS_ENCRYPTION_KEY:-}" ]; then
        echo "⚠️  $ENV_FILE and $OTHER_FILE use the same CREDENTIALS_ENCRYPTION_KEY. Changing it makes stored LLM keys unreadable, so re-upload configs' keys after you do."
    fi
fi

# Don't deploy production while a multi-participant study is live: Cloud Run
# can briefly run two lab instances, and matchmaking and chat live in memory.
# Uses your production CLI login, which must be an admin. FORCE_DEPLOY=1 skips.
if [ "$TARGET" = "production" ]; then
    if [ "${FORCE_DEPLOY:-}" = "1" ]; then
        echo "⚠️  FORCE_DEPLOY=1: skipping the live-study check."
    else
        echo "🔎 Checking production for live group studies..."
        set +e
        ACTIVITY=$(bun run apps/manager/cli/src/index.ts --env production admin activity --since 1h --fail-if-live 2>&1)
        ACTIVITY_STATUS=$?
        set -e
        case $ACTIVITY_STATUS in
            0)
                echo "✅ No group study is live."
                ;;
            2)
                echo "❌ Production deploy stopped. A deploy can split or drop live groups."
                echo ""
                echo "$ACTIVITY"
                echo ""
                echo "Wait until they finish, or deploy anyway: FORCE_DEPLOY=1 ./scripts/deploy.sh production"
                exit 1
                ;;
            *)
                echo "❌ Could not check production for live group studies:"
                echo "$ACTIVITY"
                if echo "$ACTIVITY" | grep -q "HTTP 401"; then
                    echo "Log in first: bun run apps/manager/cli/src/index.ts --env production login"
                elif echo "$ACTIVITY" | grep -q "HTTP 403"; then
                    echo "The check needs an admin login. Ask an admin to run: pairit admin add-user <your-email> --admin"
                fi
                echo "To deploy without the check: FORCE_DEPLOY=1 ./scripts/deploy.sh production"
                exit 1
                ;;
        esac
    fi
fi

echo "🚀 Deploying $TARGET"
echo "   Project: $PROJECT_ID"
echo "   Region:  $REGION"
echo "   Database: $DB_NAME"
echo "   Bucket:  $STORAGE_PATH"

# Get project number to compute deterministic Cloud Run URLs
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
if [ -z "$PROJECT_NUMBER" ]; then
    echo "❌ Could not get project number for $PROJECT_ID"
    exit 1
fi

# Compute Cloud Run URLs (deterministic: service-projectnumber.region.run.app)
MANAGER_SERVICE_URL="https://${MANAGER_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
LAB_SERVICE_URL="https://${LAB_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"

# Public URLs: custom domains when set in the env file (LAB_PUBLIC_URL,
# MANAGER_PUBLIC_URL), otherwise the Cloud Run URLs. Auth and links use the
# public URLs; the Cloud Run URLs stay trusted so older links keep working.
MANAGER_PUBLIC_URL="${MANAGER_PUBLIC_URL:-$MANAGER_SERVICE_URL}"
LAB_PUBLIC_URL="${LAB_PUBLIC_URL:-$LAB_SERVICE_URL}"
MANAGER_PUBLIC_URL="${MANAGER_PUBLIC_URL%/}"
LAB_PUBLIC_URL="${LAB_PUBLIC_URL%/}"

echo "📍 Manager URL: $MANAGER_PUBLIC_URL (service: $MANAGER_SERVICE_URL)"
echo "📍 Lab URL: $LAB_PUBLIC_URL (service: $LAB_SERVICE_URL)"

echo "✅ MONGODB_URI is set (database: $DB_NAME)"

# 0. APIs and Artifact Registry
echo "🔧 Enabling APIs..."
gcloud services enable artifactregistry.googleapis.com secretmanager.googleapis.com \
    iam.googleapis.com iamcredentials.googleapis.com --project "$PROJECT_ID"
echo "🔧 Checking Artifact Registry..."
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

# 0a. Runtime service accounts, one per service, with no project roles.
# scripts/setup-wif.sh creates them too, so GitHub Actions does not need
# permission to create service accounts.
ensure_service_account() {
    local name=$1
    local display=$2
    local email="${name}@${PROJECT_ID}.iam.gserviceaccount.com"
    if ! gcloud iam service-accounts describe "$email" --project "$PROJECT_ID" &>/dev/null; then
        echo "👤 Creating service account $email..." >&2
        gcloud iam service-accounts create "$name" \
            --project "$PROJECT_ID" \
            --display-name "$display" >/dev/null
        # A new account can take a few seconds before IAM bindings accept it.
        local tries=0
        until gcloud iam service-accounts describe "$email" --project "$PROJECT_ID" &>/dev/null || [ $tries -ge 10 ]; do
            tries=$((tries + 1))
            sleep 3
        done
        sleep 5
    fi
    printf '%s\n' "$email"
}
LAB_SA=$(ensure_service_account "$LAB_SA_NAME" "Pairit lab (Cloud Run)")
MANAGER_SA=$(ensure_service_account "$MANAGER_SA_NAME" "Pairit manager (Cloud Run)")
echo "✅ Runtime service accounts: $LAB_SA, $MANAGER_SA"
# The manager signs media upload URLs through the IAM API as itself.
# scripts/setup-wif.sh grants this once; GitHub Actions cannot, so a failure
# here is only a warning.
if ! gcloud iam service-accounts add-iam-policy-binding "$MANAGER_SA" \
    --project "$PROJECT_ID" \
    --role roles/iam.serviceAccountTokenCreator \
    --member "serviceAccount:$MANAGER_SA" >/dev/null 2>&1; then
    echo "⚠️  Could not let $MANAGER_SA sign upload URLs. If large media uploads fail, run scripts/setup-wif.sh $TARGET as a project owner."
fi

# 0b. Secrets. Each env-file secret becomes a Secret Manager secret named
# pairit-<key>. A new version is added only when the value changed. Prints
# the version number to deploy, so each revision pins the exact value.
secret_name() {
    printf 'pairit-%s\n' "$(printf '%s' "$1" | tr 'A-Z_' 'a-z-')"
}
upsert_secret() {
    local name=$1
    local value=$2
    local current version
    if ! gcloud secrets describe "$name" --project "$PROJECT_ID" &>/dev/null; then
        echo "🔐 Creating secret $name..." >&2
        gcloud secrets create "$name" \
            --project "$PROJECT_ID" \
            --replication-policy automatic >/dev/null
        current=""
    else
        current=$(gcloud secrets versions access latest --secret "$name" --project "$PROJECT_ID" 2>/dev/null || true)
    fi
    if [ -z "$current" ] || [ "$current" != "$value" ]; then
        echo "🔐 Adding a new version of $name..." >&2
        version=$(printf '%s' "$value" | gcloud secrets versions add "$name" \
            --project "$PROJECT_ID" \
            --data-file=- \
            --format='value(name)')
    else
        version=$(gcloud secrets versions describe latest --secret "$name" \
            --project "$PROJECT_ID" \
            --format='value(name)')
    fi
    printf '%s\n' "${version##*/}"
}
grant_secret_access() {
    local name=$1
    local sa=$2
    gcloud secrets add-iam-policy-binding "$name" \
        --project "$PROJECT_ID" \
        --member "serviceAccount:$sa" \
        --role roles/secretmanager.secretAccessor >/dev/null
}

# add_secret <secret source key> <env var name> <value> <lab|-> <manager|->
# Stores the value as secret pairit-<source key>, lets the named services'
# accounts read it, and adds ENV=secret:version to their --set-secrets list.
LAB_SECRETS=""
MANAGER_SECRETS=""
add_secret() {
    local source_key=$1
    local env_key=$2
    local value=$3
    local for_lab=$4
    local for_manager=$5
    local name version
    name=$(secret_name "$source_key")
    version=$(upsert_secret "$name" "$value")
    if [ -z "$version" ]; then
        echo "❌ Could not store secret $name in $PROJECT_ID."
        echo "   The deploying account needs roles/secretmanager.admin. See 'Deploying from GitHub Actions' in docs/docs/dev/deployment.md (scripts/setup-wif.sh $TARGET)."
        exit 1
    fi
    if [ "$for_lab" = "lab" ]; then
        grant_secret_access "$name" "$LAB_SA"
        LAB_SECRETS="${LAB_SECRETS:+$LAB_SECRETS,}$env_key=$name:$version"
    fi
    if [ "$for_manager" = "manager" ]; then
        grant_secret_access "$name" "$MANAGER_SA"
        MANAGER_SECRETS="${MANAGER_SECRETS:+$MANAGER_SECRETS,}$env_key=$name:$version"
    fi
    echo "✅ $env_key → $name (version $version)"
}

echo "🔐 Storing secrets in Secret Manager..."
add_secret MONGODB_URI MONGODB_URI "$MONGODB_URI" lab manager
add_secret GOOGLE_CLIENT_SECRET GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET" lab manager
if [ -n "${CREDENTIALS_ENCRYPTION_KEY:-}" ]; then
    # The manager encrypts per-config LLM keys and the lab decrypts them.
    add_secret CREDENTIALS_ENCRYPTION_KEY CREDENTIALS_ENCRYPTION_KEY "$CREDENTIALS_ENCRYPTION_KEY" lab manager
fi
for optional in OPENAI_API_KEY ANTHROPIC_API_KEY MEMBER_ID_SECRET SIMULATION_KEY; do
    if [ -n "${!optional:-}" ]; then
        add_secret "$optional" "$optional" "${!optional}" lab -
    fi
done
# Each server signs its own sign-in cookies, on its own host, so the lab and
# manager need not share AUTH_SECRET. Set MANAGER_AUTH_SECRET to give the
# manager its own (manager and CLI users sign in again once). Without it the
# manager keeps using AUTH_SECRET.
if [ -n "${MANAGER_AUTH_SECRET:-}" ] && [ "$MANAGER_AUTH_SECRET" != "$AUTH_SECRET" ]; then
    add_secret AUTH_SECRET AUTH_SECRET "$AUTH_SECRET" lab -
    add_secret MANAGER_AUTH_SECRET AUTH_SECRET "$MANAGER_AUTH_SECRET" - manager
    # An earlier deploy may have let the manager read the lab's secret.
    gcloud secrets remove-iam-policy-binding "$(secret_name AUTH_SECRET)" \
        --project "$PROJECT_ID" \
        --member "serviceAccount:$MANAGER_SA" \
        --role roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
else
    add_secret AUTH_SECRET AUTH_SECRET "$AUTH_SECRET" lab manager
    echo "ℹ️  The manager shares AUTH_SECRET with the lab. Set MANAGER_AUTH_SECRET in $ENV_FILE to give it its own."
fi

# 0c. Media bucket. Objects are public to read by URL, but nobody outside can
# list the bucket.
MEDIA_BUCKET="$STORAGE_PATH"
echo "🔧 Checking media bucket gs://$MEDIA_BUCKET..."
if ! gcloud storage buckets describe "gs://$MEDIA_BUCKET" --project "$PROJECT_ID" &>/dev/null; then
    echo "🪣 Creating bucket gs://$MEDIA_BUCKET..."
    gcloud storage buckets create "gs://$MEDIA_BUCKET" \
        --project="$PROJECT_ID" \
        --location="$REGION" \
        --uniform-bucket-level-access
else
    echo "✅ Bucket gs://$MEDIA_BUCKET exists."
fi
# legacyObjectReader grants storage.objects.get only, so the stable public URL
# the manager returns works while listing the bucket does not. Add it before
# removing objectViewer so public URLs never stop working.
gcloud storage buckets add-iam-policy-binding "gs://$MEDIA_BUCKET" \
    --project="$PROJECT_ID" \
    --member=allUsers \
    --role=roles/storage.legacyObjectReader >/dev/null
# Fails when the binding is already gone; that is the state we want.
gcloud storage buckets remove-iam-policy-binding "gs://$MEDIA_BUCKET" \
    --project="$PROJECT_ID" \
    --member=allUsers \
    --role=roles/storage.objectViewer >/dev/null 2>&1 || true
echo "✅ gs://$MEDIA_BUCKET objects are public to read; the bucket is not public to list."
# Only the manager writes media.
gcloud storage buckets add-iam-policy-binding "gs://$MEDIA_BUCKET" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:$MANAGER_SA" \
    --role=roles/storage.objectAdmin >/dev/null
echo "✅ $MANAGER_SA can write to gs://$MEDIA_BUCKET."

# Define Image Paths
LAB_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/pairit-lab"
MANAGER_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/pairit-manager"

# Plain (non-secret) env vars, with ++ as the delimiter so commas in values
# (AUTH_TRUSTED_ORIGINS) are kept. Secrets go in --set-secrets.
MANAGER_ENV="NODE_ENV=production"
MANAGER_ENV="$MANAGER_ENV++STORAGE_BACKEND=gcs"
MANAGER_ENV="$MANAGER_ENV++STORAGE_PATH=$STORAGE_PATH"
MANAGER_ENV="$MANAGER_ENV++GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
MANAGER_ENV="$MANAGER_ENV++AUTH_BASE_URL=${MANAGER_PUBLIC_URL}"
MANAGER_ENV="$MANAGER_ENV++AUTH_TRUSTED_ORIGINS=${MANAGER_PUBLIC_URL},${MANAGER_SERVICE_URL}"
MANAGER_ENV="$MANAGER_ENV++PAIRIT_LAB_URL=${LAB_PUBLIC_URL}"
MANAGER_ENV="$MANAGER_ENV++MANAGER_BOOTSTRAP_ADMIN_EMAIL=${MANAGER_BOOTSTRAP_ADMIN_EMAIL:-harang@pairium.ai}"
MANAGER_ENV="$MANAGER_ENV++MANAGER_ADMIN_CONTACT_EMAIL=${MANAGER_ADMIN_CONTACT_EMAIL:-harang@pairium.ai}"
MANAGER_ENV="$MANAGER_ENV++GIT_SHA=$GIT_SHA"

LAB_ENV="NODE_ENV=production"
LAB_ENV="$LAB_ENV++STORAGE_BACKEND=gcs"
LAB_ENV="$LAB_ENV++STORAGE_PATH=$STORAGE_PATH"
LAB_ENV="$LAB_ENV++GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
LAB_ENV="$LAB_ENV++AUTH_BASE_URL=${LAB_PUBLIC_URL}"
LAB_ENV="$LAB_ENV++AUTH_TRUSTED_ORIGINS=${LAB_PUBLIC_URL},${LAB_SERVICE_URL}"
LAB_ENV="$LAB_ENV++GIT_SHA=$GIT_SHA"

# Cloud Build configs
CLOUDBUILD_MANAGER=$(make_temp)
CLOUDBUILD_LAB=$(make_temp)

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
echo "   Lab: $LAB_IMAGE (with VITE_MANAGER_URL=$MANAGER_PUBLIC_URL)"

MANAGER_BUILD_LOG=$(make_temp)
LAB_BUILD_LOG=$(make_temp)

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
        --substitutions=_IMAGE="$LAB_IMAGE",_VITE_MANAGER_URL="$MANAGER_PUBLIC_URL" \
        --project "$PROJECT_ID" \
        . > "$LAB_BUILD_LOG" 2>&1
) &
LAB_BUILD_PID=$!

# Wait for both builds to complete
MANAGER_BUILD_FAILED=0
LAB_BUILD_FAILED=0

wait $MANAGER_BUILD_PID || MANAGER_BUILD_FAILED=1
wait $LAB_BUILD_PID || LAB_BUILD_FAILED=1

if [ $MANAGER_BUILD_FAILED -eq 1 ]; then
    echo "❌ Manager Build Failed!"
    cat "$MANAGER_BUILD_LOG"
    exit 1
fi

if [ $LAB_BUILD_FAILED -eq 1 ]; then
    echo "❌ Lab Build Failed!"
    cat "$LAB_BUILD_LOG"
    exit 1
fi

echo "✅ Both images built successfully"

# 2. Deploy both services in parallel
echo "📦 Deploying services in parallel..."

MANAGER_DEPLOY_LOG=$(make_temp)
LAB_DEPLOY_LOG=$(make_temp)

# --set-env-vars and --set-secrets each replace the whole set, so a variable
# that used to be a plain env var becomes a secret in the same revision.
# Manager runs on one instance: the CLI login codes live in its memory.
(
    gcloud run deploy "$MANAGER_SERVICE" \
        --image "$MANAGER_IMAGE" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --service-account "$MANAGER_SA" \
        --max-instances 1 \
        --set-env-vars "^++^$MANAGER_ENV" \
        --set-secrets "$MANAGER_SECRETS" \
        --allow-unauthenticated > "$MANAGER_DEPLOY_LOG" 2>&1
) &
MANAGER_DEPLOY_PID=$!

(
    gcloud run deploy "$LAB_SERVICE" \
        --image "$LAB_IMAGE" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --service-account "$LAB_SA" \
        --port 3001 \
        --max-instances 1 \
        --concurrency 1000 \
        --timeout 3600 \
        --cpu 2 \
        --memory 1Gi \
        --set-env-vars "^++^$LAB_ENV" \
        --set-secrets "$LAB_SECRETS" \
        --allow-unauthenticated > "$LAB_DEPLOY_LOG" 2>&1
) &
LAB_DEPLOY_PID=$!

# Wait for both deployments to complete
MANAGER_DEPLOY_FAILED=0
LAB_DEPLOY_FAILED=0

wait $MANAGER_DEPLOY_PID || MANAGER_DEPLOY_FAILED=1
wait $LAB_DEPLOY_PID || LAB_DEPLOY_FAILED=1

if [ $MANAGER_DEPLOY_FAILED -eq 1 ]; then
    echo "❌ Manager Deployment Failed!"
    cat "$MANAGER_DEPLOY_LOG"
    exit 1
fi

if [ $LAB_DEPLOY_FAILED -eq 1 ]; then
    echo "❌ Lab Deployment Failed!"
    cat "$LAB_DEPLOY_LOG"
    exit 1
fi

echo "✅ Both services deployed successfully"
cat "$MANAGER_DEPLOY_LOG"
cat "$LAB_DEPLOY_LOG"

# The services no longer run as the default compute service account, so it
# no longer needs to write media. Fails when already removed; that is fine.
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud storage buckets remove-iam-policy-binding "gs://$MEDIA_BUCKET" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:$COMPUTE_SA" \
    --role=roles/storage.objectAdmin >/dev/null 2>&1 || true

# Get final Manager URL
MANAGER_URL=$(gcloud run services list --filter="SERVICE:$MANAGER_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format="value(URL)")
if [ -z "$MANAGER_URL" ]; then
    MANAGER_URL=$(gcloud run services describe "$MANAGER_SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null)
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Manager: $MANAGER_PUBLIC_URL (service: $MANAGER_URL)"
echo "📍 Lab: $LAB_PUBLIC_URL (service: $LAB_SERVICE_URL)"
echo ""
echo "⚠️  POST-DEPLOYMENT CHECKLIST:"
echo "1. Add OAuth redirect URIs to Google Cloud Console:"
echo "   - ${MANAGER_PUBLIC_URL}/api/auth/callback/google"
echo "   - ${LAB_PUBLIC_URL}/api/auth/callback/google"
echo "2. Whitelist Cloud Run IPs in MongoDB Atlas (or use 0.0.0.0/0 for dev)"
