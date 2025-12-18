# Deployment Guide

This guide describes how to deploy the Pairit application (Lab Server and Manager Server) to Google Cloud Platform (Cloud Run).

## Prerequisites

- **Google Cloud SDK (`gcloud`)** installed and authenticated.
- **Bun** runtime installed locally.
- **Docker** installed (optional, for local verification).
- Access to the GCP project (`pairit-lab-staging`).

## Directory Structure

Key deployment files are organized as follows:

```
.
├── cloudbuild.lab.yaml       # Cloud Build config for Lab Server
├── cloudbuild.manager.yaml   # Cloud Build config for Manager Server
├── Dockerfile.lab            # Dockerfile for Lab Server
├── Dockerfile.manager        # Dockerfile for Manager Server
└── scripts/
    └── deployment/
        ├── deploy.sh             # Main deployment script
        ├── verify-cloud.sh       # Verification script for Cloud Run
        └── verify-production.sh  # Local Docker Compose verification
```

## Configuration

1.  **Environment Variables**:
    *   Create a `.env.production` file in the root directory (use `scripts/deployment/env.production.template` as a reference).
    *   Required variables:
        *   `PROJECT_ID`: GCP Project ID (e.g., `pairit-lab-staging`). *Obtain from the Google Cloud Console Dashboard.*
        *   `MONGODB_URI`: Production MongoDB connection string. *Obtain from MongoDB Atlas > Database > Connect.*
        *   `AUTH_SECRET`: Generate using `openssl rand -hex 32`.
        *   `GOOGLE_CLIENT_ID`: OAuth 2.0 Client ID. *Obtain from GCP Console > APIs & Services > Credentials.*
        *   `GOOGLE_CLIENT_SECRET`: OAuth 2.0 Client Secret. *Obtain from GCP Console > APIs & Services > Credentials.*
        *   `GOOGLE_CLIENT_SECRET`: OAuth 2.0 Client Secret. *Obtain from GCP Console > APIs & Services > Credentials.*
        *   `STORAGE_BACKEND`: Set to `gcs`.
        *   `STORAGE_PATH`: GCS Bucket name (e.g., `pairit-media-prod`).
        *   `AUTH_BASE_URL`: Full URL to auth endpoint (e.g., `https://[SERVICE_URL]/api/auth`).
        *   `AUTH_TRUSTED_ORIGINS`: Comma-separated list of trusted origins (e.g., `https://[SERVICE_URL]`). *Required to prevent INVALID_ORIGIN errors.*

    *   **Required Permissions**:
        The Cloud Run Service Account (default: `[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`) requires specific IAM roles:
        1.  **Storage Object Admin** (`roles/storage.objectAdmin`) on the target GCS bucket.
        2.  **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) on the Service Account itself (needed for signing public URLs).
            *   *Note*: Ensure the `IAM Service Account Credentials API` (`iamcredentials.googleapis.com`) is enabled in the project.

2.  **Google OAuth**:
    *   Configure your OAuth Concent Screen in GCP Console.
    *   Create Credentials > OAuth Client ID.
    *   **Application type**: `Web application`
    *   **Name**: `Pairit Production` (or similar)
    *   **Authorized JavaScript origins**:
        *   `https://[LAB_SERVICE_URL]` (e.g., `https://pairit-lab-xyz.run.app`)
        *   `https://[MANAGER_SERVICE_URL]`
    *   **Authorized redirect URIs** (Critical):
        *   `https://[LAB_SERVICE_URL]/api/auth/callback/google`
        *   `https://[MANAGER_SERVICE_URL]/api/auth/callback/google`
    
    > **How to obtain Service URLs**: Run the deployment script once. It will output the `Service URL` for both services at the end. You must then update these OAuth settings with the actual URLs.

## Deployment

To deploy both services to Cloud Run:

```bash
cd scripts/deployment
./deploy.sh
```

This script will:
1.  Source variables from `.env.production`.
2.  Enable Artifact Registry if needed.
3.  Build Docker images using Cloud Build (configured in `cloudbuild.*.yaml`).
4.  Push images to Artifact Registry.
5.  Deploy services to Cloud Run with correct environment variables.

## Verification

After deployment, verify the services are healthy:

```bash
cd scripts/deployment
./verify-cloud.sh [LAB_URL] [MANAGER_URL]
```

Example:
```bash
./verify-cloud.sh https://pairit-lab-xyz.run.app https://pairit-manager-xyz.run.app
```


## Architecture & Setup Notes

### 1. Monorepo Dependency Management
The project uses a **Bun Monorepo** structure. However, for Docker builds to work correctly with Cloud Run, we made specific configurations:
- **Hoisted Dependencies**: Critical shared dependencies like `better-auth` and `mongodb` are defined in the **root** `package.json`. This ensures they are consistently installed and available to all workspace packages (`lab/server`, `manager/server`, `lib/auth`) during the Docker build process, preventing runtime "Cannot find package" errors.
- **Workspaces**: Defined as wildcards (e.g., `lab/*`, `manager/*`) in `package.json`.

### 2. Docker Build Context
We use **Google Cloud Build** (`cloudbuild.yaml` files) instead of simple `docker build` commands.
- **Reason**: The servers depend on code in `lib/auth`. To copy these files into the Docker image, the build context must be the **project root**.
- **Mechanism**: The deployment script triggers Cloud Build from the root context, allowing `Dockerfile`s to `COPY lib/auth` and other shared resources.
- **Frontend Build**: The `Dockerfile.lab` includes a step to build the frontend (`lab/app`) and copy the static assets (`dist`) to the final image, where they are served by the Lab Server.

### 3. Google OAuth Configuration Details
When configuring the OAuth Consent Screen and Credentials:
- **Application Type**: Web Application.
- **Authorized Origins**: The actual Cloud Run URLs (e.g., `https://pairit-lab-[PROJECT_HASH].us-central1.run.app`).
- **Authorized Redirect URIs**: Must include the callback path: `/api/auth/callback/google`.
- **Note**: If you re-deploy to a new URL, you **MUST** update these URIs in the Google Cloud Console.

## Deployment Script Internals (`deploy.sh`)

The `scripts/deployment/deploy.sh` script automates several manual steps:
1.  **Context Switching**: It changes directory to the project root to run builds, ensuring the full monorepo context is available.
2.  **Artifact Registry**: Checks for and creates the `pairit-repo` repository if it doesn't exist.
3.  **Dynamic Envs**: It injects the *actual* Cloud Run URLs into `AUTH_BASE_URL` environment variables during deployment. This prevents the "redirect mismatch" errors common with authentication.

## Troubleshooting

### Runtime & Build Issues
- **"Cannot find package 'better-auth'"**: This usually means the package is missing from the root `package.json`. Ensure it is listed in `dependencies` for the root, not just the workspace.
- **"Container failed to start"**:
    - Check usage of `process.env.PORT`. The app must listen on `0.0.0.0` and the port provided by Cloud Run (usually 8080).
    - detailed logs can be viewed in the "Logs" tab of the Cloud Run service.
- **Authentication Fails (401/Redirect Mismatch)**:
    - Verify `AUTH_BASE_URL` in the Cloud Run "Variables" tab matches the service URL exactly.
    - Verify `AUTH_SECRET` is consistent.
    - Double-check Google Cloud Console "Authorized redirect URIs" list.
