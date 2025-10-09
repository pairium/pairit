# Pairit Quickstart

This repo hosts a minimal end-to-end slice of the Pairit stack: a pnpm monorepo with a Vite/React client, Firebase Functions powered by Hono, and supporting packages for the configuration DSL and runtime.

## Prerequisites

- Node.js 22 (Functions deploy target) or newer
- pnpm 8+
- Firebase CLI (`npm i -g firebase-tools`) if you want to run emulators

## Repository Structure

- `apps/functions`: Firebase Cloud Functions API built with Hono that exposes the session endpoints.
- `apps/web`: Vite React demo client that calls the API and walks through the sample flow.
- `packages/core`: Configuration compiler that validates YAML and emits canonical JSON.
- `packages/runtime`: Runtime helpers for deterministic seeding and flow advancement.
- `configs/`: Sample survey config and the publish script.
- `specs.md`: Technical specification covering the end-to-end architecture.

## Quickstart

1. Install dependencies: `pnpm install`.
2. Build the workspaces: `pnpm build`.
3. Compile the sample config: `pnpm publish:example` (writes `configs/simple-survey.json`).
4. Start local services: open three terminals (A `pnpm emulators`, B `pnpm --filter functions dev`, C `pnpm --filter web dev`) then visit `http://localhost:5173`.
5. Manual walkthrough: click **Start session** in the web client, watch the `POST /sessions/start` response with `sessionId` and node `intro`, click **Next** to advance to `survey_1` then `outro`, and confirm the session doc under `sessions/{sessionId}` in the Firestore emulator.
6. API spot checks (optional): start a session with `curl -X POST http://localhost:5001/pairit-local/us-central1/api/sessions/start -H 'Content-Type: application/json' -d '{"publicId":"demo"}'`, advance it with `curl -X POST http://localhost:5001/pairit-local/us-central1/api/sessions/SESSION_ID/advance -H 'Content-Type: application/json' -d '{"event":{"type":"next"}}'`, and fetch state with `curl http://localhost:5001/pairit-local/us-central1/api/sessions/SESSION_ID`.
7. Tests: `pnpm test` (runs the compiler unit test and checks other packages for pending tests).

