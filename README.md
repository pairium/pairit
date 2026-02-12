# Pairit Quickstart

This monorepo hosts the Pairit stack.

## Repository Structure

- `apps/`: Deployable applications
  - `lab/`: Participant-facing app
    - `app/`: Vite + React frontend
    - `server/`: Elysia + Bun backend
  - `manager/`: Experimenter-facing tools
    - `cli/`: CLI for managing experiments
    - `server/`: Elysia + Bun backend
- `packages/`: Shared libraries
  - `storage/`: Storage abstraction (Local/GCS)
  - `auth/`: Authentication configuration
  - `db/`: Database utilities
  - `html/`: HTML utilities
- `scripts/`: Deployment and test scripts
- `docs/`: Documentation (MkDocs)

## Prerequisites

- [Bun](https://bun.sh/) 1.1 or newer
- [Docker](https://www.docker.com/) (recommended for full stack coordination)
- [MongoDB](https://www.mongodb.com/) (if running locally without Docker)

## Quickstart

### Experimenters

1. Review the experimenter docs in `docs/` or at [pairit-lab-docs.web.app](https://pairit-lab-docs.web.app), starting with `docs/docs/quickstart.md` for a YAML template.
2. Use the CLI to validate or publish your config (see `apps/manager/cli/README.md`):

   ```bash
   # Login first
   pairit login

   # Manage configs
   pairit config lint your_experiment.yaml
   pairit config compile your_experiment.yaml
   pairit config upload your_experiment.yaml --owner you@example.com
   ```

3. Share the published experiment link with participants.

### Developers

1. Install dependencies:
   ```bash
   bun install
   ```

2. Configure environment variables:
   ```bash
   # Copy template for local development
   cp env.local.template .env.local
   # Edit .env.local with your values (Google OAuth, etc.)

   # For Lab Server (requires different AUTH_BASE_URL for native development)
   cp .env.local apps/lab/server/.env.local
   # Update apps/lab/server/.env.local: AUTH_BASE_URL="http://localhost:3001/api/auth"
   ```

3. Choose a development mode:

   **Option A: Docker-based (Full stack in containers)**
   ```bash
   # Quick start (uses existing images)
   docker compose up -d

   # Or with rebuild (recommended after code changes)
   ./scripts/local/deploy.sh
   ```
   - Lab Server: http://localhost:3001
   - Manager Server: http://localhost:3002
   - MongoDB: localhost:27017

   To stop all services:
   ```bash
   docker compose down
   ```

   Data persists in Docker volumes. To fully reset:
   ```bash
   docker compose down -v
   ```

   **Option B: Native Bun (For hot-reload development)**
   ```bash
   # Requires .env in project root (Google OAuth + remote Atlas URI)
   bun run dev
   ```
   - Lab app (Vite): http://localhost:3000
   - Lab server: http://localhost:3001
   - Manager server: http://localhost:3002

   Open http://localhost:3000/<experimentId> to trigger the auth sign-in flow.

   Or run individually using workspace filters:
   ```bash
   bun run --filter lab-app dev      # Frontend only
   bun run --filter lab-server dev   # Lab API only
   bun run --filter manager-server dev  # Manager API only
   ```

   ⚠️ **Do not mix**: Running both Docker services and `bun run dev` causes port conflicts (3001/3002).

## Deployment

The stack is containerized using Docker and deployed via Google Cloud Build / Run.

### Environment Variables

**For local development:**
1. Copy `env.local.template` to `.env.local`
2. Edit `.env.local` with your values (Google OAuth credentials, etc.)

**For cloud deployment:**
Create `.env.production` with production values (see `scripts/cloud/env.production.template`).

**Required variables:**
- `MONGODB_URI` - MongoDB connection string
- `STORAGE_BACKEND` - `local` or `gcs`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - For OAuth authentication
- `AUTH_SECRET` - Better Auth secret (32+ characters)
- `AUTH_BASE_URL` - Base URL for auth endpoints
- `PAIRIT_LAB_URL` - Lab service URL (for manager homepage link)
- `CORS_ORIGINS` - Comma-separated allowed origins, or `*` for all (production should restrict)

## Deployment to Google Cloud

We use Google Cloud Run for a serverless, scalable deployment.

**Detailed Guide**: [Docs: Deployment Guide](docs/docs/dev/deployment.md)

### Deployment & Testing

**Deployment**
- **Local**: `./scripts/local/deploy.sh` (builds and runs with Docker Compose)
- **Cloud**: `./scripts/cloud/deploy.sh [PROJECT_ID] [REGION]` (deploys to Cloud Run)

**Testing**
Unified test runner for both environments:
- **Local**: `./scripts/test.sh local` (verifies health + runs integration tests)
- **Cloud**: `./scripts/test.sh cloud` (discovers URLs + runs integration tests against prod)
