# Pairit Quickstart

This monorepo hosts the Pairit stack.

## Repository Structure

- `docs/`
- `lab/`: Participant-facing app
  - `app/`: Vite + React frontend
  - `server/`: Elysia + Bun backend
- `manager/`: Experimenter-facing tools
  - `cli/`: CLI for managing experiments
  - `server/`: Elysia + Bun backend
- `lib/`: Shared libraries
  - `storage/`: Storage abstraction (Local/GCS)
  - `auth/`: Authentication configuration

## Prerequisites

- [Bun](https://bun.sh/) 1.1 or newer
- [Docker](https://www.docker.com/) (recommended for full stack coordination)
- [MongoDB](https://www.mongodb.com/) (if running locally without Docker)

## Quickstart

### Experimenters

1. Review the experimenter docs in `docs/` or at [pairit-lab-docs.web.app](https://pairit-lab-docs.web.app), starting with `docs/quickstart.md` for a YAML template.
2. Use the CLI to validate or publish your config (see `manager/cli/README.md`):

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

2. Start local stack (Services + MongoDB):
   ```bash
   docker compose up -d
   ```
   - Lab Server: http://localhost:3001
   - Manager Server: http://localhost:3002
   - MongoDB: localhost:27017

3. Development Mode (Monorepo):
   ```bash
   # Run dev for all packages (lab, manager, cli)
   bun run dev
   ```
   
   Or individually:
   - Lab Server: `cd lab/server && bun run dev`
   - Manager Server: `cd manager/server && bun run dev`
   - CLI: `cd manager/cli && bun run dev`

## Deployment

The stack is containerized using Docker and deployed via Google Cloud Build / Run.

### Environment Variables

See `.env.example` (create it if missing) for required environment variables:
- `MONGODB_URI`
- `STORAGE_BACKEND` (local/gcs)
- `GOOGLE_APPLICATION_CREDENTIALS` (if using GCS)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (for Auth)
- `AUTH_SECRET` (for Better Auth)

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


## Todo

- [x] visual feedback for buttons
- [x] fix survey required items
- [x] add back button
- [x] media in Cloud Storage, keep metadata in MongoDB (migrated from Firestore)
- [x] firestore events (migrated to MongoDB)
  - [x] survey
  - [x] other components too
- [x] refactor runtime
  - [x] registry
  - [x] normalizer
  - [x] regression test
- [x] add paginated survey component
- [x] sessions
  - [x] store data (MongoDB)
- [x] update landing page with example configs
- [x] lab app auth (Better Auth)
- [x] cli auth (Better Auth)
- [ ] make app & docs look nice like [shadcn](https://ui.shadcn.com/)
   - [ ] consolidate styles
- [ ] make app & docs look nice like [shadcn](https://ui.shadcn.com/)
   - [ ] consolidate styles

### Backlog/Completed Modernization
- [x] unify lab app (Bun + Hono serving both API and frontend) -> Implemented with Elysia + Static Plugin
- [x] remove Firebase Functions dependency -> Migrated to Dockerized Elysia servers
- [x] single Docker deployment -> `docker-compose.yml` created

