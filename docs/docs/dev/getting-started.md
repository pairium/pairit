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

Copy the template and fill in your credentials:

```bash
cp env.template .env
```

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

```bash
bun run dev
```

This starts:
- Lab app (Vite): http://localhost:3000
- Lab server (API): http://localhost:3001
- Manager server: http://localhost:3002

Open `http://localhost:3000/<experimentId>` to trigger sign-in.

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
