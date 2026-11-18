#!/bin/bash
set -euo pipefail

# setup-wif.sh staging|production
#
# One-time Google setup for deploys from GitHub Actions. Safe to run again.
# Run it yourself, as a project owner, before merging changes that need it.
#
# 1. Lets the github-deploy service account manage Secret Manager secrets.
#    deploy.sh stores the env file's secrets there.
# 2. Creates the services' runtime accounts (pairit-lab, pairit-manager), with
#    no project roles. deploy.sh grants each one only the secrets and bucket it
#    needs, and creates them itself if missing, but GitHub Actions cannot.
#    Lets pairit-manager sign media upload URLs as itself.
# 3. Lets only the GitHub environment of the same name use github-deploy:
#    repo:pairium/pairit:environment:<target>. Removes the older binding that
#    let any workflow or branch in the repository use it.
#
# Assumes the pool "github", provider "github", and service account
# "github-deploy" from "Deploying from GitHub Actions" in
# docs/docs/dev/deployment.md. Set PROJECT_ID to override the project.

TARGET=${1:-}
case "$TARGET" in
    staging) PROJECT_ID=${PROJECT_ID:-pairit-lab-staging} ;;
    production) PROJECT_ID=${PROJECT_ID:-pairit-lab} ;;
    *)
        echo "Usage: scripts/setup-wif.sh staging|production"
        exit 1
        ;;
esac

REPO="pairium/pairit"
POOL="github"
DEPLOY_SA="github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
POOL_PATH="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
NEW_MEMBER="principal://iam.googleapis.com/${POOL_PATH}/subject/repo:${REPO}:environment:${TARGET}"
OLD_MEMBER="principalSet://iam.googleapis.com/${POOL_PATH}/attribute.repository/${REPO}"

echo "Project: $PROJECT_ID ($PROJECT_NUMBER)"
echo "Deploy account: $DEPLOY_SA"

echo "== APIs"
gcloud services enable secretmanager.googleapis.com iam.googleapis.com \
    iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"

echo "== github-deploy may manage secrets"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:$DEPLOY_SA" \
    --role roles/secretmanager.admin \
    --condition=None >/dev/null

echo "== Runtime service accounts"
for name in pairit-lab pairit-manager; do
    email="${name}@${PROJECT_ID}.iam.gserviceaccount.com"
    if gcloud iam service-accounts describe "$email" --project "$PROJECT_ID" &>/dev/null; then
        echo "$email exists"
    else
        gcloud iam service-accounts create "$name" \
            --project "$PROJECT_ID" \
            --display-name "Pairit ${name#pairit-} (Cloud Run)"
    fi
done
# The manager signs upload URLs for large media files. Without a key file,
# signing goes through the IAM API as the account itself.
MANAGER_SA="pairit-manager@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$MANAGER_SA" \
    --project "$PROJECT_ID" \
    --role roles/iam.serviceAccountTokenCreator \
    --member "serviceAccount:$MANAGER_SA" >/dev/null
echo "$MANAGER_SA can sign upload URLs"

echo "== Only the '$TARGET' GitHub environment may use github-deploy"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
    --project "$PROJECT_ID" \
    --role roles/iam.workloadIdentityUser \
    --member "$NEW_MEMBER" >/dev/null
echo "Added $NEW_MEMBER"

if gcloud iam service-accounts get-iam-policy "$DEPLOY_SA" --project "$PROJECT_ID" --format=json | grep -qF "\"$OLD_MEMBER\""; then
    gcloud iam service-accounts remove-iam-policy-binding "$DEPLOY_SA" \
        --project "$PROJECT_ID" \
        --role roles/iam.workloadIdentityUser \
        --member "$OLD_MEMBER" >/dev/null
    echo "Removed $OLD_MEMBER"
else
    echo "Repository-wide binding already removed"
fi

echo ""
echo "Done. In GitHub, Settings → Environments → $TARGET → Deployment branches and tags,"
echo "allow only the main branch, so no other branch can deploy as this environment."
