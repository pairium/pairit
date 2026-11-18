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
        *   `AUTH_SECRET`: Random string of at least 32 characters (`openssl rand -hex 32`). The deploy refuses the `env.template` value, and an `AUTH_SECRET` that `.env.staging` and `.env.production` share.
        *   `MANAGER_AUTH_SECRET` (optional): the manager's own sign-in secret. Unset, the manager uses `AUTH_SECRET`. The lab and manager set sign-in cookies on different hosts, so they do not need the same secret. Setting it signs manager and CLI users out once.
        *   `CREDENTIALS_ENCRYPTION_KEY`: `openssl rand -hex 32`. The lab and manager must share it: the manager encrypts per-config LLM keys and the lab decrypts them. Production refuses the `env.template` value.
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
1.  For production, stop if a group study is live (see [Live-study check](#live-study-check)).
1.  Refuse to run with uncommitted changes, and record the commit (`GIT_SHA`) on both services. Set `ALLOW_DIRTY=1` to deploy anyway; the version then ends in `-dirty`.
1.  Read `.env.staging` or `.env.production` as `KEY=VALUE` lines. It never runs the file as a script, and never reads `.env`.
2.  Refuse to run if staging would use the live database, or production would use the staging database. It also refuses if the two env files share a `PROJECT_ID`, a database name, a media bucket, or an `AUTH_SECRET`, or if `AUTH_SECRET` or `CREDENTIALS_ENCRYPTION_KEY` is the `env.template` example.
3.  Enable Artifact Registry, Secret Manager, and IAM.
4.  Create the runtime service accounts `pairit-lab` and `pairit-manager` if they are missing. They have no project roles.
5.  Store each secret from the env file in Secret Manager as `pairit-<name>` (for example `pairit-mongodb-uri`), adding a version only when the value changed. Each runtime account can read only the secrets its service uses. See [Secrets](#secrets).
6.  Make the media bucket readable by URL but not listable (`allUsers` gets `roles/storage.legacyObjectReader`, and the older `roles/storage.objectViewer` binding is removed). Only `pairit-manager` can write to it.
7.  Build Docker images using Cloud Build.
8.  Deploy the `manager` and `lab` services to Cloud Run, each as its own service account, with secrets from Secret Manager. The manager runs on one instance, since CLI login codes live in its memory.
9.  Remove the default compute service account's write access to the media bucket.

### Secrets

Cloud Run reads these from Secret Manager, pinned to the version the deploy stored. Plain settings (URLs, bucket name, OAuth client ID) stay ordinary env vars.

| Env var | Secret | Lab | Manager |
|---|---|---|---|
| `MONGODB_URI` | `pairit-mongodb-uri` | yes | yes |
| `GOOGLE_CLIENT_SECRET` | `pairit-google-client-secret` | yes | yes |
| `AUTH_SECRET` | `pairit-auth-secret` | yes | yes, unless `MANAGER_AUTH_SECRET` is set |
| `MANAGER_AUTH_SECRET` | `pairit-manager-auth-secret` | | as `AUTH_SECRET` |
| `CREDENTIALS_ENCRYPTION_KEY` | `pairit-credentials-encryption-key` | yes | yes |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MEMBER_ID_SECRET`, `SIMULATION_KEY` (when set) | `pairit-openai-api-key`, ... | yes | |

To change a secret, change it in the env file (and the `ENV_FILE` GitHub secret) and deploy. Rolling back to an older Cloud Run revision also rolls back to the secret versions it used.

The account that runs `deploy.sh` needs `roles/secretmanager.admin` in the project, besides the roles in [Deploying from GitHub Actions](#deploying-from-github-actions). Project owners already have it.

### Live-study check

Do not deploy production while a multi-participant study is live (see [Lab runs on one instance](#lab-runs-on-one-instance)). Check first:

```bash
pairit admin activity
```

It lists every study with sessions in the last 24 hours, live group studies first, with the owner, active participants (in a group or solo), and how many are waiting in matchmaking. A group study is live when it has a session that has not finished, changed in the last 15 minutes, and started in the last 12 hours. The 12-hour limit leaves out browser tabs left open for days on a page whose `html` component saves every few seconds or minutes. Almost every real session finishes within an hour of starting. Only admins can run it. See the [CLI README](https://github.com/pairium/pairit/tree/main/apps/manager/cli#activity-admin) for the columns.

`./scripts/deploy.sh production` runs the same check with your production CLI login before it builds anything:

- No group study live: the deploy goes ahead.
- A group study live: it stops and lists them. Wait, or deploy anyway with `FORCE_DEPLOY=1 ./scripts/deploy.sh production`.
- The check fails (not logged in, not an admin, manager down): it stops and says how to fix it. Log in with `bun run apps/manager/cli/src/index.ts --env production login`. `FORCE_DEPLOY=1` skips the check.

Staging deploys skip the check.

**GitHub Actions does not run the check yet.** The endpoint needs an admin login, and the workflow has no credential for the manager API. A CLI login is a Better Auth session that expires, so it cannot be stored as a secret. A production run of `deploy.yml` therefore stops unless you pass `force=true`, which says you ran `pairit admin activity` yourself and no group study is live. To have the workflow check for itself, the manager needs a service credential that can call `GET /admin/activity`, for example an admin API key stored as a `production` environment secret. Then replace the `Live-study check` step in `deploy.yml` with a call that fails when `liveGroupStudies` is not empty.

### Deploying from GitHub Actions

`.github/workflows/ci.yml` runs on every pull request: Biome, type check, tests, and build.

`.github/workflows/deploy.yml` runs CI and then `scripts/deploy.sh`:

- Push to `main` deploys staging, once the repo variable `STAGING_AUTO_DEPLOY` is `true`. Docs-only pushes are skipped.
- Production deploys only by hand: Actions → Deploy → Run workflow → `production`, from `main`.
- A manual run deploys the `ref` input, a tag or full 40-character commit SHA. Left blank, it deploys the latest `main`, which is what staging runs. So check staging, then deploy production with `ref` blank.
- The ref must be on `main`. Before anything gets credentials, the `resolve` job turns it into a commit SHA with `scripts/resolve-deploy-ref.sh` (taken from `main`) and stops if the commit is not on `main`, so unmerged branches and pull requests never deploy. Later jobs check out only that SHA.

```bash
# Run `pairit admin activity` first; force=true says no group study is live
gh workflow run deploy.yml -f target=production -f force=true                # what staging runs
gh workflow run deploy.yml -f target=production -f force=true -f ref=<sha>   # an older commit on main, e.g. to roll back
```

The workflow cannot check for live studies itself (see [Live-study check](#live-study-check)), so a production run without `force=true` stops before deploying.

A production deploy then publishes the docs from the same commit, so the docs describe what production runs. `docs.yml` no longer runs on push; start it by hand from `main` only to republish (`gh workflow run docs.yml -f ref=<sha>`). It checks the ref the same way, and builds with the versions pinned in `docs/uv.lock`.

Only the job that deploys can get a Google token (`id-token: write`), and Google accepts it only from the GitHub environment named for the target. Actions are pinned to commit SHAs. The `ENV_FILE` values with secret-looking names (`*SECRET*`, `*KEY*`, `*TOKEN*`, `*PASSWORD*`, `*CREDENTIAL*`, `*URI*`) are masked in the logs.

Each production deploy is a Platform release. Before deploying, move the `## Unreleased` → `### Platform` bullets in `docs/docs/changelog.md` into a `## Platform YYYY.MM.DD` section and merge that. After the deploy, tag the deployed commit `platform-vYYYY.MM.DD` and create its GitHub Release. The steps are in `AGENTS.md` under "Release notes".

To roll back in seconds without a rebuild, send traffic to an earlier Cloud Run revision: `gcloud run services update-traffic lab --to-revisions=<revision>=100 --region us-central1 --project <project>` (same for `manager`). The next deploy replaces it, so revert the bad commit first.

One-time setup, per environment (`staging`, `production`):

1.  In GitHub (Settings → Environments), create the environment. Under Deployment branches and tags, allow only `main`. For `production`, add yourself as a required reviewer.
2.  Add the secret `ENV_FILE` with the whole contents of `.env.staging` or `.env.production`.
3.  Add the variables `LAB_URL`, `MANAGER_URL` (the public URLs in the table above), `GCP_WORKLOAD_IDENTITY_PROVIDER`, and `GCP_SERVICE_ACCOUNT`.
4.  In that environment's Google project, create a deploy service account and let GitHub use it through Workload Identity Federation, limited to that GitHub environment of `pairium/pairit`:

    ```bash
    TARGET=staging                  # or production
    PROJECT_ID=pairit-lab-staging   # or pairit-lab
    PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
    SA=github-deploy@$PROJECT_ID.iam.gserviceaccount.com

    gcloud services enable iamcredentials.googleapis.com sts.googleapis.com secretmanager.googleapis.com iam.googleapis.com --project $PROJECT_ID
    gcloud iam service-accounts create github-deploy --project $PROJECT_ID
    for role in run.admin cloudbuild.builds.editor artifactregistry.admin storage.admin \
                serviceusage.serviceUsageConsumer serviceusage.serviceUsageAdmin \
                iam.serviceAccountUser secretmanager.admin viewer; do
      gcloud projects add-iam-policy-binding $PROJECT_ID --member "serviceAccount:$SA" --role "roles/$role" --condition=None >/dev/null
    done

    gcloud iam workload-identity-pools create github --project $PROJECT_ID --location global
    gcloud iam workload-identity-pools providers create-oidc github --project $PROJECT_ID \
      --location global --workload-identity-pool github \
      --issuer-uri https://token.actions.githubusercontent.com \
      --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
      --attribute-condition "assertion.repository == 'pairium/pairit'"
    # Only jobs that run in this GitHub environment (the deploy job) can use the account.
    gcloud iam service-accounts add-iam-policy-binding $SA --project $PROJECT_ID \
      --role roles/iam.workloadIdentityUser \
      --member "principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/subject/repo:pairium/pairit:environment:$TARGET"

    # Runtime accounts for the services. deploy.sh grants their access.
    gcloud iam service-accounts create pairit-lab --project $PROJECT_ID
    gcloud iam service-accounts create pairit-manager --project $PROJECT_ID
    # The manager signs media upload URLs as itself.
    MANAGER_SA=pairit-manager@$PROJECT_ID.iam.gserviceaccount.com
    gcloud iam service-accounts add-iam-policy-binding $MANAGER_SA --project $PROJECT_ID \
      --role roles/iam.serviceAccountTokenCreator --member "serviceAccount:$MANAGER_SA"

    echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
    echo "GCP_SERVICE_ACCOUNT=$SA"
    ```

When you change a local `.env.staging` or `.env.production`, update the matching `ENV_FILE` secret too.

Projects set up before November 2026 let any workflow in the repository use `github-deploy`, and deploy without Secret Manager. Bring one up to date, staging first, with `bash scripts/setup-wif.sh staging` (then `production`), run as a project owner. It is safe to run again. It adds `roles/secretmanager.admin` to `github-deploy`, creates the runtime accounts, lets `pairit-manager` sign upload URLs, binds `github-deploy` to the environment's subject, and removes the repository-wide binding.

The default compute service account (`<project number>-compute@developer.gserviceaccount.com`) still has the project's default Editor role. The services no longer run as it, but Cloud Build may, so check what uses it before you remove that role.

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
5.  **Secrets**: Secrets go to Cloud Run with `--set-secrets`, never `--set-env-vars`, so they do not appear in the service's configuration. See [Secrets](#secrets).
6.  **Containers**: Both images use a pinned Bun version (`oven/bun:1.3.8`) and run as the image's unprivileged `bun` user.

## Troubleshooting

### Runtime & Build Issues
- **"Cannot find package 'better-auth'"**: This usually means the package is missing from the root `package.json`. Ensure it is listed in `dependencies` for the root, not just the workspace.
- **"Container failed to start"**:
    - Check usage of `process.env.PORT`. The app must listen on `0.0.0.0` and the port provided by Cloud Run (usually 8080).
    - detailed logs can be viewed in the "Logs" tab of the Cloud Run service.
- **Authentication Fails (401/Redirect Mismatch)**:
    - Verify `AUTH_BASE_URL` in the Cloud Run "Variables" tab matches the service URL exactly.
    - Verify `AUTH_SECRET` is consistent. It is the `pairit-auth-secret` secret in Secret Manager (`pairit-manager-auth-secret` for the manager, if set).
- **"Permission denied" on a secret during deploy**: the deploying account needs `roles/secretmanager.admin`. Run `bash scripts/setup-wif.sh <staging|production>` as a project owner.
- **Container fails to start with "public example value"**: `AUTH_SECRET` or `CREDENTIALS_ENCRYPTION_KEY` is the `env.template` value. Generate one with `openssl rand -hex 32`.
    - Double-check Google Cloud Console "Authorized redirect URIs" list.
