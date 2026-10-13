# Getting Started (Development)

Set up the Pairit monorepo for local development.

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- MongoDB (Atlas or local)
- Google Cloud project (for OAuth credentials)

## Setup

```bash
git clone https://github.com/pairium/pairit.git
cd pairit
bun install
```

## Environment

Copy the template:

```bash
cp env.template .env
```

Its defaults point at a local MongoDB and send the CLI to your local manager. The Google OAuth values are dummies: the servers start, but sign-in fails. For real sign-in, use an OAuth client whose redirect URIs include `http://localhost:3000/api/auth/callback/google` (lab) and `http://localhost:3002/api/auth/callback/google` (manager).

Set `MANAGER_BOOTSTRAP_ADMIN_EMAIL` to your Google email so the local manager lets you upload configs.

Required variables:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `AUTH_SECRET` | Random string for session encryption |

Optional (defaults work for local dev):

| Variable | Description |
|----------|-------------|
| `STORAGE_BACKEND` | `local` or `gcs` (default: `local`) |
| `STORAGE_PATH` | Storage location (default: `.storage`) |
| `OPENAI_API_KEY` | For AI agent features |
| `ANTHROPIC_API_KEY` | For Claude agent features |

## Run

Start MongoDB, then the dev servers:

```bash
mkdir -p ~/.pairit-mongo && mongod --dbpath ~/.pairit-mongo
bun run dev
```

Run `mongod` in its own terminal and keep it running.

This starts:
- Lab app (Vite): http://localhost:3000
- Lab server (API): http://localhost:3001
- Manager server: http://localhost:3002

Use the lab on port 3000. Port 3001 serves the last `bun run build`.

## Test a config locally

Log in to your local manager and upload a config with the CLI from source:

```bash
bun run apps/manager/cli/src/index.ts login
bun run apps/manager/cli/src/index.ts config upload configs/hello-world.yaml --config-id hello-world
```

Add `--openai-api-key <key>` for configs with agents. Then open `http://localhost:3000/hello-world` and sign in with Google.

To skip sign-in, or to act as several participants at once (e.g. matchmaking or a shared chat), open the experiment as Prolific participants. Each `PROLIFIC_PID` is a separate participant:

```
http://localhost:3000/hello-world?PROLIFIC_PID=a&STUDY_ID=s&SESSION_ID=1
http://localhost:3000/hello-world?PROLIFIC_PID=b&STUDY_ID=s&SESSION_ID=2
```

The CLI targets `PAIRIT_API_URL` from `.env` unless you pass `--env staging` or `--env production`.

## Filter by Package

```bash
bun run --filter lab-app dev       # Frontend only
bun run --filter lab-server dev    # Lab API only
bun run --filter manager-server dev # Manager API only
```

## Other Commands

```bash
bun run build      # Build all packages
bun run test       # Run tests
biome check        # Lint and format
tsc --noEmit       # Type check
```

## Next Steps

- [Architecture](architecture.md) - System overview
- [Backend](backend.md) - API routes and database
- [Deployment](deployment.md) - Production setup
