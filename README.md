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

## Quickstart

### Experimenters

1. Review the experimenter docs in `docs/` or at [pairium.github.io/pairit](https://pairium.github.io/pairit/), starting with `docs/docs/quickstart.md` for a YAML template.
2. Use the CLI to validate or publish your config (see `apps/manager/cli/README.md`):

   ```bash
   # Login first
   pairit login

   # Manage configs
   pairit config lint your_experiment.yaml
   pairit config compile your_experiment.yaml
   pairit config upload your_experiment.yaml --config-id your-experiment
   ```

   If your experiment uses AI agents, upload provider credentials with the config:

   ```bash
   pairit config upload your_experiment.yaml \
     --config-id your-experiment \
     --openai-api-key sk-...
   ```

   or:

   ```bash
   pairit config upload your_experiment.yaml \
     --config-id your-experiment \
     --anthropic-api-key sk-ant-...
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
   cp env.template .env
   # Edit .env with your values (Google OAuth, MongoDB, OpenAI, etc.)
   ```

3. Start development:
   ```bash
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

## Deployment

The stack is containerized using Docker and deployed via Google Cloud Build / Run.

### Environment Variables

1. Copy `env.template` to `.env`
2. Edit `.env` with your values (local defaults work as-is; set real values for production)

**Required variables:**
- `MONGODB_URI` - MongoDB connection string
- `STORAGE_BACKEND` - `local` or `gcs`
- `STORAGE_PATH` - Storage location (local path or GCS bucket name)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - For OAuth authentication
- `AUTH_SECRET` - Better Auth secret (32+ characters, has insecure default in dev)
- `CREDENTIALS_ENCRYPTION_KEY` - 32-byte key (base64 or 64-char hex) used to encrypt per-experiment LLM credentials

**Production only:**
- `AUTH_BASE_URL` - Base URL for auth endpoints (auto-derived from PORT in dev)
- `PAIRIT_LAB_URL` - Lab service URL (for manager homepage link)
- `CORS_ORIGINS` - Comma-separated allowed origins (allows all in dev)

**Optional:**
- `PAIRIT_API_URL` - Manager server URL for CLI (defaults to `http://localhost:3002`)

## Per-experiment LLM credentials

Agent-backed experiments do not use a shared platform OpenAI or Anthropic key anymore.

- Experimenters upload provider keys per config with `pairit config upload`
- Keys are encrypted at rest in MongoDB
- Lab agent calls resolve keys by `configId`
- If a required provider key is missing, the agent call fails
- There is no fallback to the platform's global OpenAI or Anthropic env key for experiment agent runs

Re-uploading a config without passing a new provider key keeps the previously stored key for that config. That continues billing the experiment owner's key, not the platform key.

## Deployment to Google Cloud

We use Google Cloud Run for a serverless, scalable deployment.

**Detailed Guide**: [Docs: Deployment Guide](docs/docs/dev/deployment.md)

### Deployment & Testing

**Deployment**
- **Cloud**: `./scripts/deploy.sh [PROJECT_ID] [REGION]` (deploys to Cloud Run)

**Testing**
- **Local**: `./scripts/test.sh local` (verifies health + runs integration tests)
- **Cloud**: `./scripts/test.sh cloud` (discovers URLs + runs integration tests against prod)

---

© 2026 Pairium AI. All rights reserved.
