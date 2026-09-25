# Deployment Guide

This guide describes how to deploy the Pairit application (Lab Server and Manager Server) to Google Cloud Platform (Cloud Run).

## Staging and production

Local dev uses `.env`. Cloud deploys never read that file.

| | Staging | Production |
|---|---|---|
| Command | `./scripts/deploy.sh staging` | `./scripts/deploy.sh production` |
| Env file | `.env.staging` | `.env.production` |
| Google project | `pairit-lab-staging` | `pairit-lab` |
| Database | `pairit-staging` | `pairit` |
| Media bucket | `pairit-lab-media-staging` | `pairit-lab-media` |
| Lab | https://lab-823036187164.us-central1.run.app | https://lab-pdxzcarxcq-uc.a.run.app |
| Manager | https://manager-823036187164.us-central1.run.app | https://manager-pdxzcarxcq-uc.a.run.app |

Staging and production are separate Google projects, separate OAuth apps, and separate media buckets. They share one Atlas cluster, with different database names. The deploy script refuses to run if a staging deploy would use `pairit`, or a production deploy would use a database whose name contains `staging`.

Try a change on staging first. Deploy production only after staging looks right.

The published `pairit` CLI talks to production. Point it at staging by setting both URLs, then log in again. That login replaces the saved production login. Run `pairit login` with those variables unset to switch back.

```bash
PAIRIT_API_URL=https://manager-823036187164.us-central1.run.app \
PAIRIT_LAB_URL=https://lab-823036187164.us-central1.run.app \
pairit login
```

## Prerequisites

- **Google Cloud SDK (`gcloud`)** installed and authenticated.
- **Bun** runtime installed locally.
- **Docker** installed (for Cloud Build only, not needed for local dev).
- Access to the staging and production GCP projects. They are separate projects.

## Directory Structure
Key deployment files are organized as follows:

```
.
├── Dockerfile.lab            # Dockerfile for Lab Server
├── Dockerfile.manager        # Dockerfile for Manager Server
├── scripts/
│   ├── deploy.sh             # Cloud Run deployment
│   ├── test.sh               # Unified verification & test runner
│   └── tests/
│       └── verify-health.sh  # Health check script
```

## Configuration

1.  **Environment Variables**:
    *   Local dev: copy `env.template` to `.env`.
    *   Cloud: copy `env.template` to `.env.staging` and `.env.production`. These files stay on your machine (they are gitignored).
    *   Staging and production each need their own Google project, OAuth client, `AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, and `STORAGE_PATH` (media bucket). Do not share those.
    *   Staging `MONGODB_URI` must name a database that contains `staging` (Atlas database `pairit-staging`). Production uses the `pairit` database.
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
./scripts/deploy.sh staging
./scripts/deploy.sh production
```

Optional second argument is the region (default `us-central1`).

This script will:
1.  Source `.env.staging` or `.env.production`. It never sources `.env`.
2.  Refuse to run if staging would use the live database, or production would use the staging database. It also refuses if the two env files share a `PROJECT_ID` or a database name.
3.  Enable Artifact Registry.
4.  Build Docker images using Cloud Build.
5.  Deploy the `manager` and `lab` services to Cloud Run.

## Verification

After deployment, verify the services are healthy and run integration tests using the unified runner:

```bash
./scripts/test.sh local
./scripts/test.sh staging
./scripts/test.sh production
```


## Architecture & Setup Notes

### 1. Monorepo Dependency Management
The project uses a **Bun Monorepo** structure. However, for Docker builds to work correctly with Cloud Run, we made specific configurations:
- **Workspace Dependencies**: Shared dependencies like `better-auth` and `mongodb` are defined in their respective workspace packages (`apps/lab/server`, `apps/manager/server`, `packages/auth`) for clear dependency ownership.
- **Workspaces**: Defined as `apps/lab/*`, `apps/manager/*`, and `packages/*` in `package.json`.

### 2. Docker Build Context
We use **Google Cloud Build** (`cloudbuild.yaml` files) instead of simple `docker build` commands.
- **Reason**: The servers depend on code in `packages/auth`. To copy these files into the Docker image, the build context must be the **project root**.
- **Mechanism**: The deployment script triggers Cloud Build from the root context, allowing `Dockerfile`s to `COPY packages/` and other shared resources.
- **Frontend Build**: The `Dockerfile.lab` includes a step to build the frontend (`apps/lab/app`) and copy the static assets (`dist`) to the final image, where they are served by the Lab Server.

### 3. Google OAuth Configuration Details
When configuring the OAuth Consent Screen and Credentials:
- **Application Type**: Web Application.
- **Authorized Origins**: The Cloud Run URLs (`https://manager-<projectNumber>.<region>.run.app` and `https://lab-<projectNumber>.<region>.run.app`).
- **Authorized Redirect URIs**: Must include the callback path: `/api/auth/callback/google`.
- **Note**: If you re-deploy to a new URL, you **MUST** update these URIs in the Google Cloud Console.

## Deployment Script Internals (`deploy.sh`)

The `scripts/deploy.sh` script automates several manual steps:
1.  **Environment file**: `staging` loads `.env.staging`. `production` loads `.env.production`. The database name is read from the Mongo address the same way `packages/db` reads it.
2.  **Context Switching**: It changes directory to the project root to run builds, ensuring the full monorepo context is available.
3.  **Artifact Registry**: Checks for and creates the `pairit-repo` repository if it doesn't exist.
4.  **Dynamic Envs**: It injects the *actual* Cloud Run URLs into `AUTH_BASE_URL` environment variables during deployment. This prevents the "redirect mismatch" errors common with authentication.

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
