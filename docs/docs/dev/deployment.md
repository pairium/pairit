# Deployment Guide

Complete guide for deploying Pairit to a new Firebase/GCP project, including all required IAM roles, APIs, and configuration.

## Prerequisites

- Firebase CLI installed and authenticated (`firebase login`)
- Access to Firebase Console and Google Cloud Console
- Project created in Firebase Console

## Quick Setup Checklist

```bash
# 1. Select your Firebase project
firebase use <project-id>

# 2. Deploy Firestore indexes
firebase deploy --only firestore:indexes

# 3. Deploy Firestore security rules
firebase deploy --only firestore:rules

# 4. Deploy functions
firebase deploy --only functions:manager

# 5. Configure IAM roles (see below)
```

## Required Google Cloud IAM Roles

The default compute service account (`<project-number>-compute@developer.gserviceaccount.com`) needs the following roles:

| Role | Purpose |
|------|---------|
| **Service Usage Consumer** | Required to call Identity Toolkit API for token verification |
| **Firebase Authentication Admin** | Required to verify Firebase ID tokens |
| **Cloud Datastore User** | Required for Firestore read/write operations |
| **Storage Object Viewer** | Required for Cloud Storage media operations |
| **Artifact Registry Reader** | Auto-granted for Cloud Functions deployment |
| **Artifact Registry Writer** | Auto-granted for Cloud Functions deployment |
| **Logs Writer** | Auto-granted for Cloud Functions logging |

### How to Add IAM Roles

1. Go to [Google Cloud Console IAM](https://console.cloud.google.com/iam-admin/iam)
2. Select your project
3. Find the service account: `<project-number>-compute@developer.gserviceaccount.com`
4. Click the pencil icon to edit
5. Add each required role
6. Click **Save**

Alternatively, use gcloud CLI:

```bash
PROJECT_ID=<your-project-id>
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Add Service Usage Consumer
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"

# Add Firebase Authentication Admin
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/firebaseauth.admin"

# Add Cloud Datastore User
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"

# Add Storage Object Viewer
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
```

## Required APIs

Ensure these APIs are enabled in Google Cloud Console:

| API | Purpose |
|-----|---------|
| **Identity Toolkit API** | Firebase Authentication token verification |
| **Cloud Firestore API** | Database operations |
| **Cloud Functions API** | Deploying and running functions |
| **Cloud Run API** | Functions v2 runtime |
| **Cloud Build API** | Building function containers |

Enable via Console: [APIs & Services](https://console.cloud.google.com/apis/library)

Or via CLI:

```bash
gcloud services enable \
  identitytoolkit.googleapis.com \
  firestore.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com
```

## Firebase Console Settings

### 1. Authentication

**Sign-in Providers:**

1. Go to [Firebase Console](https://console.firebase.google.com) → Authentication → Sign-in method
2. Enable **Email/Password** provider
3. Enable **Email link (passwordless sign-in)** option within Email/Password settings
4. Enable **Google** provider for OAuth (required for `pairit auth login --provider google`)

**Authorized Domains:**

For authentication to work, you must add the following domains to Firebase's authorized domains list:

1. Go to Firebase Console → Authentication → Settings → Authorized domains
2. Click **Add domain** and add:
   - `127.0.0.1` (for CLI's local OAuth callback server)
   - Your Cloud Functions domain, e.g., `manager-xxxxx-xx.a.run.app` (for Email Link authentication). You can find this URL in the output of `firebase deploy --only functions:manager` or in Firebase project homepage's Functions tab

> **Note**: `localhost` is typically authorized by default, but `127.0.0.1` must be added explicitly for the CLI OAuth flow. The Cloud Functions domain is **required** for Email Link authentication—Firebase will reject `sendOobCode` requests with `UNAUTHORIZED_DOMAIN` error if the `continueUrl` domain is not allowlisted.

### 2. Firestore

1. Go to Firebase Console → Firestore Database
2. Create database if not exists (choose region, start in production mode)
3. Deploy security rules: `firebase deploy --only firestore:rules`
4. Deploy indexes: `firebase deploy --only firestore:indexes`

### 3. Storage (for media uploads)

1. Go to Firebase Console → Storage
2. Create default bucket if not exists
3. Note the bucket name (typically `<project-id>.firebasestorage.app`)

## Firestore Indexes

The `firestore.indexes.json` file defines required composite indexes:

```json
{
  "indexes": [
    {
      "collectionGroup": "configs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "owner", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

After deployment, Firestore will show the index with fields: `owner` ↑, `updatedAt` ↓, `__name__` ↓ (the `__name__` field is automatically added by Firestore).

Deploy with: `firebase deploy --only firestore:indexes`

## Function Configuration

### Cloud Run Settings

The manager function requires `invoker: 'public'` to allow the application to handle authentication (rather than Cloud Run IAM):

```typescript
// manager/functions/src/index.ts
export const manager = onRequest({ 
  region: 'us-east4', 
  invoker: 'public'  // Required: allows app-level auth
}, async (req, res) => {
  // ...
});
```

Without this setting, Cloud Run will reject requests before they reach your code.

## Function Environment Variables

OAuth secrets are configured on Cloud Functions (server-side), not on the CLI. This means CLI users don't need to configure any secrets for Google Sign-In.

### Required Secrets for Cloud Functions

The manager function requires these secrets for authentication. They are declared in the function definition and automatically injected as environment variables at runtime:

```typescript
// manager/functions/src/index.ts
export const manager = onRequest({ 
  region: 'us-east4', 
  invoker: 'public',
  secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PAIRIT_FIREBASE_API_KEY'],
}, async (req, res) => {
  // ...
});
```

| Secret Name | Purpose |
|-------------|---------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID for Google Sign-In |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret for Google Sign-In |
| `PAIRIT_FIREBASE_API_KEY` | Firebase Web API Key (note: `FIREBASE_` prefix is reserved by Firebase, so we use `PAIRIT_` prefix) |

**Set secrets via Firebase CLI (using Secret Manager):**

```bash
# Set each secret (you'll be prompted to enter the value)
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set PAIRIT_FIREBASE_API_KEY

# Or pipe values directly
echo "your-client-id" | firebase functions:secrets:set GOOGLE_CLIENT_ID --data-file=-
echo "your-client-secret" | firebase functions:secrets:set GOOGLE_CLIENT_SECRET --data-file=-
echo "your-api-key" | firebase functions:secrets:set PAIRIT_FIREBASE_API_KEY --data-file=-
```

> **Note**: Firebase Functions v2 uses Secret Manager for secrets, not `firebase functions:config:set` (which was for v1). The secrets are automatically granted access to the compute service account during deployment.

**Get these values from:**
- `PAIRIT_FIREBASE_API_KEY`: Firebase Console → Project Settings → General → Web API Key
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application type)

### Configuring Google OAuth Client

> **Important**: You must create a **Web application** OAuth client, NOT a Desktop app. Using a Desktop app client will result in `Error 401: invalid_client` during the OAuth flow.

1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Select Application type: **Web application** (NOT Desktop app)
4. Name: `Pairit Manager` (or similar)
5. Under **Authorized redirect URIs**, click **+ ADD URI** and add:
   - `https://manager-<hash>-<region>.a.run.app/auth/google/callback`
   - (Find your exact URL from `firebase deploy --only functions:manager` output or Firebase Console → Functions)
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

**Why Web application?** The server-side OAuth flow requires a proper client secret validation and redirect URI matching, which only Web application clients support. Desktop app clients use a different flow and will fail with `invalid_client` error.

## CLI Environment Variables (Optional)

**CLI users don't need to set any environment variables for authentication!** Both Google OAuth and Email Link authentication use server-side flows.

The following are optional overrides for development or custom deployments:

```bash
# Optional: Override functions URL (for development or custom deployments)
PAIRIT_FUNCTIONS_BASE_URL=https://manager-xxxxx-xx.a.run.app

# Optional: For automatic token refresh (if not set, user will need to re-login when token expires)
FIREBASE_API_KEY=<your-firebase-web-api-key>
```

**Note:** Both `pairit auth login --provider google` and `pairit auth login --provider email` work without any local secrets. The only reason to set `FIREBASE_API_KEY` locally is to enable automatic token refresh (tokens expire after 1 hour).

## Verification Steps

After setup, verify everything works:

```bash
# 1. Login
pairit auth login

# 2. Check auth status
pairit auth status

# 3. List configs (should return empty or your configs)
pairit config list

# 4. Upload a test config
pairit config upload manager/test-config.yaml
```

## Troubleshooting

### OAuth Error 401: invalid_client

**Cause**: The Google OAuth client is configured as "Desktop app" instead of "Web application", or the client ID/secret is incorrect.

**Fix**: 
1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Check your OAuth 2.0 Client ID type - it must be **Web application**
3. If it's a Desktop app, create a new Web application client
4. Ensure the authorized redirect URI matches exactly: `https://manager-<hash>-<region>.a.run.app/auth/google/callback`
5. Update secrets with the new client ID and secret:
   ```bash
   firebase functions:secrets:set GOOGLE_CLIENT_ID
   firebase functions:secrets:set GOOGLE_CLIENT_SECRET
   firebase deploy --only functions:manager
   ```

### 401 Unauthorized (HTML response)

**Cause**: Cloud Run IAM blocking requests before they reach your app.

**Fix**: Ensure `invoker: 'public'` is set in the function definition and redeploy.

### 401 Unauthorized (JSON response)

**Cause**: Firebase token verification failing.

**Fix**: 
1. Add `Service Usage Consumer` role to compute service account
2. Add `Firebase Authentication Admin` role to compute service account
3. Wait 2-5 minutes for IAM propagation
4. Redeploy function to get fresh credentials

### 500 NOT_FOUND

**Cause**: Missing Firestore composite index.

**Fix**: Deploy indexes with `firebase deploy --only firestore:indexes`

### 500 PERMISSION_DENIED

**Cause**: Service account lacks Firestore access.

**Fix**: Add `Cloud Datastore User` role to compute service account.

## Environment Summary

| Setting | Location | Value |
|---------|----------|-------|
| Function invoker | `manager/functions/src/index.ts` | `invoker: 'public'` |
| Firestore indexes | `firestore.indexes.json` | configs: owner↑, updatedAt↓ |
| IAM: Service Usage Consumer | GCP IAM | compute service account |
| IAM: Firebase Auth Admin | GCP IAM | compute service account |
| IAM: Cloud Datastore User | GCP IAM | compute service account |
| IAM: Storage Object Viewer | GCP IAM | compute service account |
| API: Identity Toolkit | GCP APIs | Enabled |
| Auth: Email/Password | Firebase Auth | Enabled (with email link) |
| Auth: Google | Firebase Auth | Enabled |
| Auth: Authorized domains | Firebase Auth | `127.0.0.1`, Cloud Functions URL |
| **Server:** PAIRIT_FIREBASE_API_KEY | Secret Manager | Web API Key |
| **Server:** GOOGLE_CLIENT_ID | Secret Manager | OAuth Client ID |
| **Server:** GOOGLE_CLIENT_SECRET | Secret Manager | OAuth Client Secret |
| CLI: PAIRIT_FUNCTIONS_BASE_URL | .env (optional) | Override functions URL |

