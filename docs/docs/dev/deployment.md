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
├── scripts/
│   ├── local/
│   │   └── deploy.sh         # Local Docker Compose deployment
│   ├── cloud/
│   │   └── deploy.sh         # Cloud Run deployment
│   └── test.sh               # Unified verification & test runner
└── tests/
    └── verify-health.sh      # Health check script
```

## Configuration

1.  **Environment Variables**:
    *   **Cloud**: Create a `.env.production` file in the root directory (use `scripts/cloud/env.production.template` as a reference).
    *   **Local**: Create a `.env.local` file (use `env.local.template`).
        *   Note: If running with native Bun (`bun dev`), you must also create `lab/server/.env.local` with `AUTH_BASE_URL="http://localhost:3001/api/auth"`.
    *   Required variables (see references):
        *   `NODE_ENV`: `development` or `production`. Controls CORS and debug endpoints.
        *   `PROJECT_ID`: GCP Project ID.
        *   `MONGODB_URI`: Production/Local connection string.
        *   `AUTH_SECRET`: Random 32-char string.
        *   `GOOGLE_CLIENT_ID` / `SECRET`: OAuth credentials.
        *   `STORAGE_BACKEND`: `gcs` (cloud) or `local`.
        *   `STORAGE_PATH`: GCS Bucket name or local path.
        *   `PAIRIT_LAB_URL`: Lab service URL (for manager homepage link)
        *   `CORS_ORIGINS`: Comma-separated allowed origins. Ignored if `NODE_ENV=development` (allows `*`).

## Deployment

### Cloud Deployment
To deploy both services to Cloud Run:

```bash
./scripts/cloud/deploy.sh [PROJECT_ID] [REGION]
```

This script will:
1.  Source variables from `.env.production`.
2.  Enable Artifact Registry.
3.  Build Docker images using Cloud Build.
4.  Deploy services to Cloud Run.

### Local Deployment
To run services locally with Docker Compose:

```bash
./scripts/local/deploy.sh
```

## Verification

After deployment, verify the services are healthy and run integration tests using the unified runner:

```bash
# Verify Cloud Deployment
./scripts/test.sh cloud

# Verify Local Deployment
./scripts/test.sh local
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

The `scripts/cloud/deploy.sh` script automates several manual steps:
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
