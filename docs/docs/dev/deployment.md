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
| Lab | https://pairit-staging.pairium.ai | https://pairit.pairium.ai |
| Manager | https://pairit-api-staging.pairium.ai | https://pairit-api.pairium.ai |

Staging and production are separate Google projects, separate OAuth apps, and separate media buckets. They share one Atlas cluster, with different database names. The deploy script refuses to run if a staging deploy would use `pairit`, or a production deploy would use a database whose name contains `staging`.

Try a change on staging first. Deploy production only after staging looks right.

The published `pairit` CLI talks to production. Add `--env staging` to any command to use staging. Each environment keeps its own saved login, so logging in to staging does not replace the production login.

```bash
pairit --env staging login
pairit --env staging config upload configs/hello-world.yaml
```

You can also set `PAIRIT_ENV=staging`. `PAIRIT_API_URL` and `PAIRIT_LAB_URL` still override the URLs, for local development.

Set `LAB_PUBLIC_URL` and `MANAGER_PUBLIC_URL` in the env file to serve an environment from custom domains. Auth and links then use those domains, and the Cloud Run URLs stay trusted.

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
1.  Refuse to run with uncommitted changes, and record the commit (`GIT_SHA`) on both services. Set `ALLOW_DIRTY=1` to deploy anyway; the version then ends in `-dirty`.
1.  Source `.env.staging` or `.env.production`. It never sources `.env`.
2.  Refuse to run if staging would use the live database, or production would use the staging database. It also refuses if the two env files share a `PROJECT_ID`, a database name, or a media bucket.
3.  Enable Artifact Registry.
4.  Build Docker images using Cloud Build.
5.  Deploy the `manager` and `lab` services to Cloud Run.

### Deploying from GitHub Actions

`.github/workflows/ci.yml` runs on every pull request: Biome, type check, tests, and build.

`.github/workflows/deploy.yml` runs CI and then `scripts/deploy.sh`:

- Push to `main` deploys staging, once the repo variable `STAGING_AUTO_DEPLOY` is `true`. Docs-only pushes are skipped.
- Production deploys only by hand: Actions → Deploy → Run workflow → `production`, from `main`.

One-time setup, per environment (`staging`, `production`):

1.  In GitHub (Settings → Environments), create the environment. For `production`, add yourself as a required reviewer.
2.  Add the secret `ENV_FILE` with the whole contents of `.env.staging` or `.env.production`.
3.  Add the variables `LAB_URL`, `MANAGER_URL` (the public URLs in the table above), `GCP_WORKLOAD_IDENTITY_PROVIDER`, and `GCP_SERVICE_ACCOUNT`.
4.  In that environment's Google project, create a deploy service account and let GitHub use it through Workload Identity Federation, limited to `pairium/pairit`:

    ```bash
    PROJECT_ID=pairit-lab-staging   # or pairit-lab
    PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
    SA=github-deploy@$PROJECT_ID.iam.gserviceaccount.com

    gcloud iam service-accounts create github-deploy --project $PROJECT_ID
    for role in run.admin cloudbuild.builds.editor artifactregistry.admin storage.admin \
                serviceusage.serviceUsageConsumer serviceusage.serviceUsageAdmin \
                iam.serviceAccountUser logging.viewer browser; do
      gcloud projects add-iam-policy-binding $PROJECT_ID --member "serviceAccount:$SA" --role "roles/$role" >/dev/null
    done

    gcloud iam workload-identity-pools create github --project $PROJECT_ID --location global
    gcloud iam workload-identity-pools providers create-oidc github --project $PROJECT_ID \
      --location global --workload-identity-pool github \
      --issuer-uri https://token.actions.githubusercontent.com \
      --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
      --attribute-condition "assertion.repository == 'pairium/pairit'"
    gcloud iam service-accounts add-iam-policy-binding $SA --project $PROJECT_ID \
      --role roles/iam.workloadIdentityUser \
      --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/pairium/pairit"

    echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
    echo "GCP_SERVICE_ACCOUNT=$SA"
    ```

When you change a local `.env.staging` or `.env.production`, update the matching `ENV_FILE` secret too.

### Lab runs on one instance

The lab service is deployed with `--max-instances 1`. Matchmaking pools and live updates (chat, match found, state changes) live in the server's memory. Two participants on different instances cannot be matched and do not see each other's messages. One instance with `--concurrency 1000`, 2 vCPU, and 1 GiB holds several hundred participants, since most of their connections are idle streams. The server ends each stream after 2 minutes and the browser reconnects. Cloud Run's proxy keeps a stream open on the server after the browser leaves, so without that cap, departed participants would fill the 1000-request limit. A load test on staging (Oct 2026) held 400 concurrent survey participants with flat latency and no errors, at about 520 open requests.

Cloud Run can briefly run two instances while a new revision rolls out. Do not deploy while a multi-participant study is live.

### Lab version on sessions

Every session records `labVersion` (the deployed `GIT_SHA`) and `labRevision` (Cloud Run's `K_REVISION`). Both appear in the sessions data export, so researchers can tell which participants ran before and after a deploy. Local dev records `labVersion=dev`. The Docker images exclude `.git`, so the version comes only from this environment variable.

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
- **Authorized Origins**: The public URLs (`MANAGER_PUBLIC_URL` and `LAB_PUBLIC_URL`, e.g. `https://pairit-api.pairium.ai` and `https://pairit.pairium.ai`).
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
