# Pairit Quickstart

This repo hosts a minimal end-to-end slice of the Pairit stack: a pnpm monorepo with a Vite/React client, Firebase Functions powered by Hono, and supporting packages for the configuration DSL and runtime.

## Prerequisites

- Node.js 22 (Functions deploy target) or newer
- pnpm 8+
- Firebase CLI (`npm i -g firebase-tools`) if you want to run emulators

## Repository Structure

- `lab/functions`: Participant-facing app
    - `lab/functions`: Firebase Cloud Functions API built with Hono
    - `lab/app`: Vite React Tanstack frontend
- `manager`: Experimenter-facing tools and app
    - `manager/cli`
    - `manager/functions`
    - `manager/app`
- `configs/`: example configs

## Quickstart

1. Install dependencies: `pnpm install`.
2. Build the workspaces: `pnpm build`.
3. Compile the sample config: `pnpm publish:example` (writes `configs/simple-survey.json`).
4. Start local services: open three terminals (A `pnpm emulators`, B `pnpm --filter functions dev`, C `pnpm --filter web dev`) then visit `http://localhost:5173`.
5. Manual walkthrough: click **Start session** in the web client, watch the `POST /sessions/start` response with `sessionId` and node `intro`, click **Next** to advance to `survey_1` then `outro`, and confirm the session doc under `sessions/{sessionId}` in the Firestore emulator.
6. API spot checks (optional): start a session with `curl -X POST http://localhost:5001/pairit-local/us-east4/api/sessions/start -H 'Content-Type: application/json' -d '{"publicId":"demo"}'`, advance it with `curl -X POST http://localhost:5001/pairit-local/us-east4/api/sessions/SESSION_ID/advance -H 'Content-Type: application/json' -d '{"event":{"type":"next"}}'`, and fetch state with `curl http://localhost:5001/pairit-local/us-east4/api/sessions/SESSION_ID`.
7. Tests: `pnpm test` (runs the compiler unit test and checks other packages for pending tests).

## Firebase Functions & CLI Deployment

We manage two Cloud Functions codebases: `lab` (participant runtime) and `manager` (experiment management CLI API). See firebase.json.

### Local emulators

```zsh
# Install dependencies
pnpm install

# Build the function bundles once (re-run after changes)
pnpm --filter lab-functions run build
pnpm --filter manager-functions run build

# Start the emulators for Firestore + both function codebases
firebase emulators:start --only functions:lab,functions:manager,firestore --project pairit-local

# In another shell, point the CLI at the emulator if needed
export PAIRIT_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/pairit-local/us-east4/api
```

If you only want the manager API when iterating on the CLI, drop `functions:lab` from the `--only` flag.

### Deploying to Firebase

```zsh
# Authenticate and select project
firebase login
firebase use <your-project-id>

# Build the codebase you plan to deploy
pnpm --filter lab-functions run build # participant runtime (optional)
pnpm --filter manager-functions run build # manager API

# Deploy both codebases
firebase deploy --only functions

# Deploy just the manager API
firebase deploy --only functions:manager

# Or just the lab API
firebase deploy --only functions:lab
```

After deploying the manager API, update the CLI target:

```zsh
export PAIRIT_FUNCTIONS_BASE_URL=https://manager-abcd.a.run.app # or for now, update the hard coded url
```

After deploying the lab API, update `lab/app/.env.local` and `lab/app/.env.production`:
```zsh
VITE_API_URL=https://lab-abcd.a.run.app
```

The CLI defaults to the emulator URL (`http://127.0.0.1:5001/...`) when `PAIRIT_FUNCTIONS_BASE_URL` is unset and `FIREBASE_CONFIG`/`GCLOUD_PROJECT` resolve to `pairit-local`.

### Deploying the lab web app

Use Firebase Hosting (not App Hosting) for the `lab/app` frontend. The build artifact is a static bundle, so Hosting gives you the global CDN + SPA rewrites you need without managing an SSR runtime.

```zsh
# Build the app
pnpm --filter lab-app build

firebase hosting:sites:create lab-docs --project pairit-lab # run once to register the secondary site
firebase target:apply hosting lab-app your-site-id # If you use Firebase targets, bind the target once
firebase hosting:sites:create pairit-lab # or this

# Deploy (once your project is selected with `firebase use`)
firebase deploy --only hosting:lab-app
```

### Deploying the docs

```zsh
cd docs
uv sync
source .venv/bin/activate
mkdocs build
cd ..
firebase hosting:sites:create lab-docs --project pairit-lab # run once to register the secondary site
firebase target:apply hosting docs lab-docs # run once to link the target to the site name
firebase deploy --only hosting:docs
```
